/* =========================================================
   WhatTheySee — application
   A local-first mirror for passive browser exposure.
   ========================================================= */

(function () {
  "use strict";

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    snapshot: null,
    score: null,
    scanning: false,
    scanCount: 0,
    sessionLog: [],
    checkedFixes: new Set(),
    edgeStage: 0,
    toastTimer: null,
    theme: document.documentElement.getAttribute("data-theme") || "dark"
  };

  const els = {};

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[character];
  });

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  function formatStamp(iso) {
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.getTime())) return "—";
    const datePart = new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date).toUpperCase().replace(/,/g, "");
    const timePart = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).format(date);
    return `${datePart} / ${timePart}`;
  }

  function formatShortStamp(iso) {
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).format(date);
  }

  function formatLiveTime(date) {
    const value = date || new Date();
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(value);
  }

  function formatLiveDate(date) {
    const value = date || new Date();
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric"
    }).format(value).toUpperCase();
  }

  function formatDuration(ms) {
    if (typeof ms !== "number") return "—";
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`;
  }

  function groupHash(hash) {
    if (!hash) return "—";
    return hash.match(/.{1,8}/g)?.join(" ") || hash;
  }

  function formatPercent(value) {
    return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function animateNumber(element, target, duration) {
    if (!element) return;
    const end = Number(target);
    if (!Number.isFinite(end)) {
      element.textContent = "—";
      return;
    }
    if (reduceMotion) {
      element.textContent = String(end);
      element.dataset.value = String(end);
      return;
    }
    const start = Number(element.dataset.value || 0);
    if (start === end) {
      element.textContent = String(end);
      return;
    }
    const started = performance.now();
    const length = duration || 850;
    const from = Number.isFinite(start) ? start : 0;
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      element.textContent = String(end);
      element.dataset.value = String(end);
    }

    function frame(now) {
      if (finished) return;
      const progress = clamp((now - started) / length, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = String(Math.round(from + (end - from) * eased));
      if (progress < 1) requestAnimationFrame(frame);
      else finish();
    }

    requestAnimationFrame(frame);
    // rAF can be throttled to zero in occluded tabs and embedded webviews.
    // The number is evidence, so it must land even when animation cannot.
    window.setTimeout(finish, length + 90);
  }

  function animateDial(element, target) {
    if (!element) return;
    if (reduceMotion) {
      element.style.setProperty("--score", String(target));
      return;
    }
    const start = Number(element.style.getPropertyValue("--score")) || 0;
    const started = performance.now();
    const duration = 900;
    let finished = false;

    function finish() {
      if (finished) return;
      finished = true;
      element.style.setProperty("--score", String(target));
    }

    function frame(now) {
      if (finished) return;
      const progress = clamp((now - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.style.setProperty("--score", String(start + (target - start) * eased));
      if (progress < 1) requestAnimationFrame(frame);
      else finish();
    }

    requestAnimationFrame(frame);
    window.setTimeout(finish, duration + 90);
  }

  function showToast(message) {
    const toast = els.toast;
    if (!toast) return;
    window.clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    state.toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 3400);
  }

  function setScanningUi(isScanning, isRescan) {
    document.body.classList.toggle("is-scanning", isScanning);
    const scanConsole = $(".scan-console");
    if (scanConsole) scanConsole.setAttribute("aria-busy", String(isScanning));
    if (els.rescanBtn) {
      els.rescanBtn.disabled = isScanning;
      els.rescanBtn.classList.toggle("is-loading", isScanning);
    }
    if (isScanning) {
      if (els.scanBadge) els.scanBadge.innerHTML = '<span class="live-dot"></span>SCANNING';
      if (els.scanStatusText) els.scanStatusText.textContent = isRescan ? "Re-reading passive channels…" : "Opening passive channels…";
      if (els.heroStatus) els.heroStatus.classList.remove("is-complete");
      if (els.heroStatusText) els.heroStatusText.textContent = isRescan ? "Re-reading the browser surface…" : "Receiving passive signals…";
      if (els.heroStatusMeta) els.heroStatusMeta.textContent = "PASSIVE / LIVE";
      if (els.heroPermissions) els.heroPermissions.textContent = "0";
      if (els.exportJson) els.exportJson.disabled = true;
      if (els.ledgerExportJson) els.ledgerExportJson.disabled = true;
    }
  }

  function setScanProgress(label) {
    if (!state.scanning) return;
    if (els.scanStatusText) els.scanStatusText.textContent = `${label}…`;
    if (els.heroStatusText) els.heroStatusText.textContent = `${label}…`;
  }

  async function runScan(options) {
    if (state.scanning) return;
    const rescan = Boolean(options && options.rescan);
    state.scanning = true;
    setScanningUi(true, rescan);

    try {
      const snapshot = await window.WTSCollectors.collect((step, label) => {
        setScanProgress(label);
      });
      const score = window.WTSScore.compute(snapshot);
      state.scanCount += 1;
      snapshot.meta.scanNumber = state.scanCount;
      state.sessionLog.push(...snapshot.requestLog.map((entry) => ({ ...entry, scan: state.scanCount })));
      state.snapshot = snapshot;
      state.score = score;
      render(snapshot, score);
      state.scanning = false;
      setScanningUi(false, rescan);
      finishScanUi(snapshot);
      if (rescan) showToast(`Rescan complete. ${snapshot.signals.filter((signal) => signal.observed).length} signals observed, 0 prompts.`);
    } catch (error) {
      state.scanning = false;
      setScanningUi(false, rescan);
      renderScanError(error);
      // Keep console diagnostics for the curious, but never send them anywhere.
      console.error("[WhatTheySee] Passive scan failed:", error);
      showToast("The passive scan could not finish. No data left this tab.");
    }
  }

  function finishScanUi(snapshot) {
    const observed = snapshot.signals.filter((signal) => signal.observed).length;
    const total = snapshot.signals.length;

    if (els.heroStatus) els.heroStatus.classList.add("is-complete");
    if (els.heroStatusText) els.heroStatusText.textContent = "Scan complete · no prompts, no scan stored";
    if (els.heroStatusMeta) els.heroStatusMeta.textContent = `${observed} SIGNALS`;
    if (els.scanBadge) els.scanBadge.innerHTML = '<span class="live-dot"></span>SCAN COMPLETE';
    if (els.scanStatusText) {
      els.scanStatusText.textContent = `Scan complete · ${observed} signals surfaced · ${formatDuration(snapshot.durationMs)}`;
    }
    if (els.scanTimestamp) els.scanTimestamp.textContent = formatStamp(snapshot.finishedAt);
    if (els.heroSignals) animateNumber(els.heroSignals, observed, 700);
    if (els.heroRequests) animateNumber(els.heroRequests, snapshot.requestCount, 500);
    if (els.heroRequestsLabel) {
      els.heroRequestsLabel.textContent = snapshot.requestCount === 1 ? "external request" : "external requests";
    }
    if (els.exportJson) els.exportJson.disabled = false;
    if (els.ledgerExportJson) els.ledgerExportJson.disabled = false;
    if (els.rescanBtn) els.rescanBtn.disabled = false;
    if (els.signalCount) els.signalCount.textContent = String(observed);
    if (els.toast && total === 0) showToast("No signals were readable in this browser.");
  }

  function renderScanError(error) {
    if (els.heroStatusText) els.heroStatusText.textContent = "Passive scan interrupted";
    if (els.heroStatusMeta) els.heroStatusMeta.textContent = "NO SCAN STORED";
    if (els.scanBadge) els.scanBadge.innerHTML = '<span class="dot-rose"></span>SCAN INTERRUPTED';
    if (els.scanStatusText) els.scanStatusText.textContent = `Scan incomplete: ${error?.message || "unknown browser error"}`;
    if (els.exportJson) els.exportJson.disabled = true;
    if (els.rescanBtn) els.rescanBtn.disabled = false;
    if (els.scoreCopy) els.scoreCopy.textContent = "The browser returned an unexpected error. Reload or rescan; nothing was sent.";
  }

  function render(snapshot, score) {
    renderHero(snapshot, score);
    renderScore(snapshot, score);
    renderManifest(snapshot);
    renderNetwork(snapshot);
    renderSignalGrid(snapshot);
    renderFingerprint(snapshot);
    renderDossier(snapshot, score);
    renderFixesProjection(score);
    renderDevice(snapshot, score);
    updateMethodPanel();
    updateLiveClocks();
    if (els.scoreValue) animateNumber(els.scoreValue, score.score, 900);
    if (els.heroScore) animateNumber(els.heroScore, score.score, 900);
    animateDial(els.scoreDial, score.score);
    animateDial(els.heroRing, score.score);
    if (els.scoreDial) els.scoreDial.setAttribute("aria-label", `Exposure index ${score.score} out of 100: ${score.band.label.toLowerCase()}`);
    if (reduceMotion) setEdgeStage(2, { scroll: false });
  }

  function formatCoordinate(value, positive, negative) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
  }

  function renderHero(snapshot, score) {
    const hash = snapshot.fingerprint.hash || "";
    if (els.heroFingerprint) {
      els.heroFingerprint.textContent = hash ? `${hash.slice(0, 10).toUpperCase()}` : "No signature";
      els.heroFingerprint.title = hash || "No fingerprint hash available";
    }
    if (els.heroBrowser) {
      els.heroBrowser.textContent = `${snapshot.device.osLabel} / ${snapshot.device.browserLabel}`;
    }
    if (els.heroScoreLabel) els.heroScoreLabel.textContent = score.band.label;
    if (els.heroLocation) {
      const location = [snapshot.network.city, snapshot.network.country].filter(Boolean).join(", ");
      els.heroLocation.textContent = location || "IP location unavailable";
    }
    if (els.heroIsp) els.heroIsp.textContent = snapshot.networkDisplay || "Network hidden";
    if (els.heroTime) els.heroTime.textContent = formatLiveTime();
    if (els.heroNetworkType) {
      els.heroNetworkType.textContent = snapshot.networkDisplay || (snapshot.network.online ? "Network type hidden" : "Offline");
      els.heroNetworkType.title = `${snapshot.typeDisplay}${snapshot.providerDisplay ? ` · ${snapshot.providerDisplay}` : ""} · SSID hidden`;
    }
    if (els.heroCoordA) {
      const latitude = formatCoordinate(snapshot.network.latitude, "N", "S");
      els.heroCoordA.textContent = latitude || "—° N";
      els.heroCoordA.hidden = !latitude;
      if (latitude) els.heroCoordA.title = "Approximate IP latitude — not GPS";
    }
    if (els.heroCoordB) {
      const longitude = formatCoordinate(snapshot.network.longitude, "E", "W");
      els.heroCoordB.textContent = longitude || "—° E";
      els.heroCoordB.hidden = !longitude;
      if (longitude) els.heroCoordB.title = "Approximate IP longitude — not GPS";
    }
    if (els.heroDisplay) {
      els.heroDisplay.textContent = snapshot.display.screenWidth
        ? `${snapshot.display.screenWidth} × ${snapshot.display.screenHeight}`
        : "Display hidden";
    }
    if (els.heroHash) els.heroHash.textContent = hash ? `SHA-256 / ${hash.slice(0, 10).toUpperCase()}` : "SHA-256 / unavailable";
    if (els.heroPermissions) els.heroPermissions.textContent = "0";
    if (els.heroRequests) els.heroRequests.textContent = String(snapshot.requestCount);
    if (els.heroRequestsLabel) {
      els.heroRequestsLabel.textContent = snapshot.requestCount === 1 ? "external request" : "external requests";
    }
    if (els.heroSignals) els.heroSignals.textContent = String(snapshot.signals.filter((signal) => signal.observed).length);
    if (els.heroFindings) {
      $$(".hero-finding.is-loading", els.heroFindings).forEach((finding) => finding.classList.remove("is-loading"));
    }
  }

  function renderScore(snapshot, score) {
    if (els.scoreBand) els.scoreBand.textContent = score.band.label;
    if (els.scoreCopy) els.scoreCopy.textContent = window.WTSScore.bandCopy[score.band.key] || score.band.copy;
    if (els.scoreConfidence) {
      const observed = snapshot.signals.filter((signal) => signal.observed).length;
      els.scoreConfidence.textContent = `${observed} SIGNALS / ${snapshot.signals.length} CHECKED`;
    }
    if (els.scoreValue) els.scoreValue.parentElement?.setAttribute("data-band", score.band.key);
    const container = els.categoryBars;
    if (!container) return;

    container.innerHTML = score.categoryOrder.map((key) => {
      const category = score.categories[key];
      if (!category) return "";
      return `
        <div class="category-bar" data-cat="${escapeHtml(key)}">
          <div class="category-bar-label">
            <span>${escapeHtml(category.label)}</span>
            <em>${category.percent}%</em>
          </div>
          <div class="category-track" aria-hidden="true">
            <span class="category-fill" data-percent="${category.percent}" style="width:0"></span>
          </div>
        </div>
      `;
    }).join("");

    const fillBars = () => {
      $$(".category-fill", container).forEach((fill) => {
        fill.style.width = `${fill.dataset.percent}%`;
      });
    };
    requestAnimationFrame(fillBars);
    window.setTimeout(fillBars, 60);
  }

  function renderManifest(snapshot) {
    if (els.manifestDevice) els.manifestDevice.textContent = `${snapshot.device.deviceType} · ${snapshot.device.osLabel}`;
    if (els.manifestBrowser) els.manifestBrowser.textContent = snapshot.device.browserLabel;
    if (els.manifestPlatform) els.manifestPlatform.textContent = snapshot.device.platform || "Unknown";
    if (els.manifestScreen) els.manifestScreen.textContent = `${snapshot.display.screenWidth} × ${snapshot.display.screenHeight} · ${snapshot.display.devicePixelRatio}×`;
    if (els.manifestGpu) {
      const gpu = snapshot.display.webgl.renderer || snapshot.display.webgl.vendor || "Not exposed";
      els.manifestGpu.textContent = gpu;
      els.manifestGpu.title = gpu;
    }
    if (els.manifestTouch) {
      els.manifestTouch.textContent = snapshot.display.maxTouchPoints > 0
        ? `${snapshot.display.maxTouchPoints} touch points`
        : snapshot.display.coarsePointer ? "Coarse pointer" : "Mouse / trackpad";
    }
  }

  function renderNetwork(snapshot) {
    const network = snapshot.network;
    if (els.receiptIp) {
      els.receiptIp.textContent = network.ip || "Lookup unavailable";
      els.receiptIp.title = network.ip || "";
    }
    if (els.receiptLocation) {
      const location = [network.city, network.region, network.country].filter(Boolean).join(", ");
      els.receiptLocation.textContent = location || "Not available";
      els.receiptLocation.title = location || "";
    }
    if (els.receiptIsp) {
      els.receiptIsp.textContent = network.isp || network.org
        ? `${snapshot.providerDisplay || network.isp || network.org}${network.asn ? ` · AS${String(network.asn).replace(/^AS/i, "")}` : ""}`
        : "Not available";
      els.receiptIsp.title = els.receiptIsp.textContent;
    }
    if (els.receiptTz) {
      els.receiptTz.textContent = network.ipTimezone || snapshot.locale.timezone || "Unknown";
    }
    if (els.lookupProvider) {
      els.lookupProvider.textContent = network.lookupOk && network.lookupProvider
        ? `${network.lookupProvider.toUpperCase()} / IP LOOKUP`
        : "IP LOOKUP UNAVAILABLE";
    }
    if (els.receiptTime) {
      const log = snapshot.requestLog.find((entry) => entry.outcome === "success") || snapshot.requestLog[snapshot.requestLog.length - 1];
      els.receiptTime.textContent = log
        ? `${log.outcome === "success" ? "Reply" : "Attempt"} at ${formatShortStamp(log.at)} · ${log.ms} ms`
        : "No lookup attempted";
    }
    if (els.mapDot) {
      if (snapshot.mapPosition) {
        els.mapDot.hidden = false;
        els.mapDot.style.left = `${snapshot.mapPosition.x}%`;
        els.mapDot.style.top = `${snapshot.mapPosition.y}%`;
        els.mapDot.title = snapshot.locationText;
      } else {
        els.mapDot.hidden = true;
      }
    }
    if (els.mapLabel) {
      els.mapLabel.textContent = snapshot.network.city
        ? `${snapshot.network.city}${snapshot.network.countryCode ? `, ${snapshot.network.countryCode}` : ""}`
        : snapshot.network.lookupOk ? "Location unavailable" : "Lookup unavailable";
      els.mapLabel.title = snapshot.locationText;
    }
  }

  function renderSignalGrid(snapshot) {
    const container = els.signalGrid;
    if (!container) return;
    const groups = new Map();
    window.WTS_DATA.CATEGORY_ORDER.forEach((key) => groups.set(key, []));
    snapshot.signals.forEach((signal) => {
      if (!groups.has(signal.category)) groups.set(signal.category, []);
      groups.get(signal.category).push(signal);
    });

    const cards = window.WTS_DATA.CATEGORY_ORDER.map((key) => {
      const meta = window.WTS_DATA.CATEGORIES[key];
      const signals = groups.get(key) || [];
      const observedSignals = signals.filter((signal) => signal.observed);
      const shown = signals.slice().sort((a, b) => Number(b.observed) - Number(a.observed)).slice(0, 6);
      const sources = unique(observedSignals.map((signal) => signal.source)).slice(0, 2);
      const reachClass = observedSignals.length === 0
        ? "is-closed"
        : signals.some((signal) => signal.observed && signal.reach === "partial")
          ? "is-partial"
          : "is-visible";
      const reachLabel = observedSignals.length === 0 ? "UNAVAILABLE" : reachClass === "is-partial" ? "PARTLY" : "VISIBLE";

      return `
        <article class="signal-card ${reachClass}" data-category="${escapeHtml(key)}">
          <header class="signal-card-head">
            <span class="signal-icon tone-${escapeHtml(meta.tone)}" aria-hidden="true"><svg class="icon"><use href="#i-${escapeHtml(meta.icon)}"/></svg></span>
            <div class="signal-heading">
              <span class="mono-label">${escapeHtml(meta.kicker)}</span>
              <h3>${escapeHtml(meta.label)}</h3>
            </div>
            <span class="signal-count" title="${observedSignals.length} observed of ${signals.length} checked">
              <strong>${observedSignals.length}</strong><span>/${signals.length}</span>
            </span>
          </header>
          <dl class="signal-values">
            ${shown.map((signal) => `
              <div class="signal-value-row ${signal.observed ? (signal.reach === "partial" ? "is-partial" : "") : "is-unobserved"}">
                <dt>${escapeHtml(signal.label)}</dt>
                <dd title="${escapeHtml(signal.value)}">
                  <span class="visually-hidden">${signal.observed ? "Observed" : "Not exposed"}: </span>
                  <span class="signal-value-text">${escapeHtml(signal.value)}</span>
                  <span class="signal-dot ${signal.observed ? (signal.reach === "partial" ? "dot-amber" : "dot-mint") : "dot-rose"}" aria-hidden="true"></span>
                </dd>
              </div>
            `).join("")}
          </dl>
          <footer class="signal-card-foot">
            <span class="signal-source" title="${escapeHtml(unique(signals.map((signal) => signal.source)).join(", "))}">${escapeHtml(sources.join(" · ") || "No passive source")}</span>
            <span class="signal-reach">${reachLabel}</span>
          </footer>
        </article>
      `;
    }).join("");

    container.innerHTML = cards;
  }

  function renderFingerprint(snapshot) {
    const fingerprint = snapshot.fingerprint;
    if (els.fingerprintHash) {
      els.fingerprintHash.textContent = fingerprint.hash ? groupHash(fingerprint.hash) : "No local hash available";
    }
    if (els.hashStatusChip) {
      els.hashStatusChip.innerHTML = fingerprint.replay === "stable in this session"
        ? '<span class="live-dot"></span>STABLE / LOCAL'
        : '<span class="dot-amber"></span>VARIES / LOCAL';
    }
    if (els.hashReplay) {
      els.hashReplay.textContent = fingerprint.replay === "stable in this session"
        ? "Stable in this session"
        : fingerprint.replay === "changed between renders" ? "Changed between renders" : "Not testable";
    }
    if (els.copyHash) {
      els.copyHash.disabled = !fingerprint.hash;
    }
    if (els.fingerprintComponentCount) {
      els.fingerprintComponentCount.textContent = `${fingerprint.observedComponents} OF ${fingerprint.components.length} OBSERVED`;
    }
    if (els.fingerprintComponents) {
      els.fingerprintComponents.innerHTML = fingerprint.components.map((component) => `
        <article class="fp-component ${component.observed ? "is-observed" : "is-closed"}">
          <span class="fp-component-icon" aria-hidden="true"><svg class="icon"><use href="#i-${escapeHtml(component.icon)}"/></svg></span>
          <div class="fp-component-body">
            <div class="fp-component-title">
              <strong>${escapeHtml(component.label)}</strong>
              <span>${component.observed ? "OBSERVED" : "CLOSED"}</span>
            </div>
            <p title="${escapeHtml(component.value)}">${escapeHtml(component.value)}</p>
            <div class="fp-component-meta">
              <code>${component.shortHash ? `${escapeHtml(component.shortHash.toUpperCase())}…` : "NO HASH"}</code>
              <span>${escapeHtml(component.note)}</span>
            </div>
          </div>
        </article>
      `).join("");
    }
  }

  function renderDossier(snapshot, score) {
    const hash = snapshot.fingerprint.hash || "";
    if (els.dossierFileNo) els.dossierFileNo.textContent = hash ? `WTS-${hash.slice(0, 6).toUpperCase()}` : "WTS-UNKNOWN";
    if (els.dossierTimestamp) els.dossierTimestamp.textContent = formatStamp(snapshot.finishedAt);
    const place = snapshot.locationText !== "Unavailable" ? snapshot.locationText : "an unknown network";
    const network = snapshot.networkDisplay || "an unclassified network";
    const screen = snapshot.display.screenWidth ? `${snapshot.display.screenWidth}×${snapshot.display.screenHeight}` : "an unknown screen";
    const narrative = `At ${formatLiveTime()} on ${snapshot.locale.localDay}, a ${snapshot.device.deviceType.toLowerCase()} running ${snapshot.device.osLabel} and ${snapshot.device.browserLabel} appeared to connect from ${place}. The network announced itself as ${network}. The browser offered a ${screen} display at ${Number(snapshot.display.devicePixelRatio.toFixed(2))}×, preferring ${snapshot.locale.language} in ${snapshot.locale.timezone}. None of this required a click, a login or a permission prompt. None of it proves who was there.`;
    if (els.dossierNarrative) els.dossierNarrative.textContent = narrative;
    if (els.dossierDevice) els.dossierDevice.textContent = `${snapshot.device.deviceType} · ${snapshot.device.osLabel} · ${snapshot.device.browserName}`;
    if (els.dossierLocation) els.dossierLocation.textContent = snapshot.locationText === "Unavailable" ? "Approximation unavailable" : `${snapshot.locationText} (approx.)`;
    if (els.dossierTime) els.dossierTime.textContent = `${snapshot.locale.localDateTime} ${snapshot.locale.timezoneShort || ""}`.trim();
    if (els.dossierNetwork) els.dossierNetwork.textContent = network;
    if (els.dossierScreen) els.dossierScreen.textContent = `${screen} · ${Number(snapshot.display.devicePixelRatio.toFixed(2))}×`;
    if (els.dossierSignature) els.dossierSignature.textContent = hash ? `#${hash.slice(0, 12).toUpperCase()}` : "Unavailable";
    if (els.footerYear) els.footerYear.textContent = String(new Date().getFullYear());
  }

  function renderFixesProjection(score) {
    if (els.currentScore) {
      els.currentScore.textContent = String(score.score);
      els.currentScore.dataset.value = String(score.score);
    }
    updateProjection();
  }

  function updateProjection() {
    if (!state.score) {
      if (els.projectedScore) els.projectedScore.textContent = "—";
      return;
    }
    const projection = window.WTSScore.project(state.score.score, Array.from(state.checkedFixes));
    if (els.projectedScore) {
      els.projectedScore.textContent = String(projection.score);
      els.projectedScore.dataset.value = String(projection.score);
      els.projectedScore.dataset.band = projection.band.key;
    }
    if (els.fixProgressCount) els.fixProgressCount.textContent = String(state.checkedFixes.size);
    if (els.fixTotal) els.fixTotal.textContent = String(window.WTS_DATA.FIXES.length);
    if (els.fixProgressBar) {
      const percent = (state.checkedFixes.size / window.WTS_DATA.FIXES.length) * 100;
      els.fixProgressBar.style.width = `${percent}%`;
    }
    if (els.fixProgressText) {
      if (!state.score) {
        els.fixProgressText.textContent = "Waiting for the scan to finish before projecting.";
      } else if (state.checkedFixes.size === 0) {
        els.fixProgressText.textContent = `Choose a fix to see the projected drop from ${state.score.score}.`;
      } else {
        els.fixProgressText.textContent = `${state.checkedFixes.size} ${state.checkedFixes.size === 1 ? "fix" : "fixes"} in place · modelled drop of ${projection.reduction} points. Nothing uploaded.`;
      }
    }
    if (els.fixReset) {
      els.fixReset.disabled = state.checkedFixes.size === 0;
    }
  }

  function renderFixes() {
    const container = els.fixList;
    if (!container) return;
    container.innerHTML = window.WTS_DATA.FIXES.map((fix) => `
      <article class="fix-item" data-fix-id="${escapeHtml(fix.id)}">
        <div class="fix-check-wrap">
          <input class="fix-checkbox" type="checkbox" id="fix-${escapeHtml(fix.id)}" value="${escapeHtml(fix.id)}">
          <label class="fix-check-label" for="fix-${escapeHtml(fix.id)}" aria-label="Mark complete: ${escapeHtml(fix.title)}">
            <span class="fix-check-box"><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg></span>
          </label>
        </div>
        <div class="fix-item-body">
          <div class="fix-item-top">
            <span class="fix-index">${escapeHtml(fix.index)}</span>
            <span class="fix-impact">−${fix.impact} pts</span>
          </div>
          <h3>${escapeHtml(fix.title)}</h3>
          <p>${escapeHtml(fix.description)}</p>
          <div class="fix-meta">
            <span>${escapeHtml(fix.effort)}</span>
            <span>${escapeHtml(fix.tag)}</span>
            <span class="fix-impact-label">${escapeHtml(fix.impactLabel)} impact</span>
          </div>
          <details class="fix-details">
            <summary>How to do it <svg class="icon" aria-hidden="true"><use href="#i-chevron"/></svg></summary>
            <ol>${fix.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
          </details>
        </div>
      </article>
    `).join("");

    container.addEventListener("change", onFixChange);
    loadFixes();
  }

  function loadFixes() {
    let stored = [];
    try {
      const value = JSON.parse(localStorage.getItem("wts-fixes") || "[]");
      if (Array.isArray(value)) stored = value.filter((id) => window.WTS_DATA.FIXES.some((fix) => fix.id === id));
    } catch (error) {
      stored = [];
    }
    state.checkedFixes = new Set(stored);
    syncFixChecks();
    updateProjection();
  }

  function syncFixChecks() {
    $$(".fix-checkbox", els.fixList).forEach((checkbox) => {
      const checked = state.checkedFixes.has(checkbox.value);
      checkbox.checked = checked;
      checkbox.closest(".fix-item")?.classList.toggle("is-checked", checked);
    });
    if (els.fixProgressCount) els.fixProgressCount.textContent = String(state.checkedFixes.size);
    if (els.fixProgressBar) els.fixProgressBar.style.width = `${(state.checkedFixes.size / window.WTS_DATA.FIXES.length) * 100}%`;
  }

  function onFixChange(event) {
    const checkbox = event.target.closest(".fix-checkbox");
    if (!checkbox) return;
    if (checkbox.checked) state.checkedFixes.add(checkbox.value);
    else state.checkedFixes.delete(checkbox.value);
    try {
      localStorage.setItem("wts-fixes", JSON.stringify(Array.from(state.checkedFixes)));
    } catch (error) {
      // A private window or blocked storage should not break the checklist.
    }
    syncFixChecks();
    updateProjection();
  }

  function renderDevice(snapshot) {
    const device = snapshot.device;
    const display = snapshot.display;
    const battery = snapshot.battery;
    const frame = els.deviceFrame;
    if (frame) {
      frame.dataset.form = device.formFactor === "phone" ? "phone" : "desktop";
      const os = ["windows", "macos", "linux", "android", "ios"].includes(device.osKey) ? device.osKey : "windows";
      frame.dataset.os = os;
      frame.classList.toggle("is-mac", os === "macos");
      frame.classList.toggle("is-linux", os === "linux");
      frame.classList.toggle("is-phone", device.formFactor === "phone");
    }

    const network = snapshot.typeDisplay || "Network type hidden";
    const batteryLabel = battery.supported && battery.level !== null ? `${battery.level}%` : "—";
    const batteryState = battery.supported
      ? battery.charging === true ? "charging" : battery.charging === false ? "on battery" : "power state unknown"
      : "not exposed by this browser";

    if (els.edgeNetworkDesktop) els.edgeNetworkDesktop.textContent = network;
    if (els.edgeNetworkTaskbar) els.edgeNetworkTaskbar.textContent = network;
    if (els.edgeBatteryDesktop) els.edgeBatteryDesktop.textContent = batteryLabel;
    if (els.edgeBatteryTaskbar) els.edgeBatteryTaskbar.textContent = batteryLabel;
    if (els.edgeBatteryFillDesktop) els.edgeBatteryFillDesktop.style.width = `${battery.level ?? 0}%`;
    if (els.edgeBatteryFillTaskbar) els.edgeBatteryFillTaskbar.style.width = `${battery.level ?? 0}%`;
    if (els.edgeBatteryFillMobile) els.edgeBatteryFillMobile.style.width = `${battery.level ?? 0}%`;
    $$(".mini-battery").forEach((node) => node.classList.toggle("is-low", battery.supported && battery.level !== null && battery.level <= 20));

    if (els.edgeWindowScore) els.edgeWindowScore.textContent = String(state.score?.score ?? "—");
    if (els.edgeWindowScoreMobile) els.edgeWindowScoreMobile.textContent = String(state.score?.score ?? "—");
    if (els.edgeDateMobile) els.edgeDateMobile.textContent = formatLiveDate();
    if (els.edgeBigTimeMobile) els.edgeBigTimeMobile.textContent = formatLiveTime();
    if (els.edgeCalloutOs) els.edgeCalloutOs.textContent = device.osLabel;
    if (els.edgeCalloutScreen) els.edgeCalloutScreen.textContent = display.screenWidth ? `${display.screenWidth} × ${display.screenHeight}` : "Screen obscured";
    if (els.edgeCalloutNetwork) els.edgeCalloutNetwork.textContent = snapshot.networkDisplay || network;
    if (els.edgeCalloutBattery) els.edgeCalloutBattery.textContent = battery.supported ? `Battery ${batteryLabel} · ${batteryState}` : "Battery not exposed";
    if (els.edgeCalloutBattery) els.edgeCalloutBattery.title = batteryState;
    updateDeviceClocks();
    setEdgeStage(reduceMotion ? 2 : state.edgeStage, { scroll: false, renderOnly: true });
    if (!reduceMotion) updateEdgeStageFromScroll();
  }

  function updateDeviceClocks() {
    const time = formatLiveTime();
    if (els.edgeClockDesktop) els.edgeClockDesktop.textContent = time;
    if (els.edgeClockTaskbar) els.edgeClockTaskbar.textContent = time;
    if (els.edgeClockMobile) els.edgeClockMobile.textContent = time;
    if (els.edgeBigTimeMobile) els.edgeBigTimeMobile.textContent = time;
    if (els.edgeDateMobile) els.edgeDateMobile.textContent = formatLiveDate();
    if (els.heroTime) els.heroTime.textContent = time;
  }

  function updateLiveClocks() {
    updateDeviceClocks();
    if (state.snapshot && state.edgeStage === 1 && els.edgeReadout) {
      const firstValue = els.edgeReadout.querySelector("dd");
      if (firstValue) firstValue.textContent = formatLiveTime();
    }
  }

  function getEdgeStages() {
    const snapshot = state.snapshot;
    if (!snapshot) {
      return [
        {
          tag: "SURFACE", title: "The whole object.", copy: "One request. A shape appears: your operating system, browser engine, screen geometry, and an approximate place on the map.",
          readout: [["Form", "Reading…"], ["OS", "Reading…"], ["Browser", "Reading…"]]
        },
        {
          tag: "SYSTEM BAR", title: "The bar at the edge.", copy: "A clock, a battery icon, a network glyph. Ordinary UI to you; measurable signal to a page.",
          readout: [["Local time", "—:—"], ["Power", "Reading…"], ["Network", "Reading…"]]
        },
        {
          tag: "THE EDGE", title: "The line you cannot see.", copy: "Your Wi-Fi name, notification queue, files and apps stay on the other side of the browser sandbox.",
          readout: [["Wi-Fi name", "Hidden"], ["Installed apps", "Hidden"], ["Wallpaper", "Illustrative"]]
        }
      ];
    }

    const battery = snapshot.battery;
    const batteryText = battery.supported
      ? `${battery.level !== null ? `${battery.level}%` : "Level hidden"} · ${battery.charging === true ? "charging" : battery.charging === false ? "on battery" : "state unknown"}`
      : "Not exposed";
    return [
      {
        tag: "SURFACE",
        title: "The whole object.",
        copy: "One request. A shape appears: your operating system, browser engine, screen geometry, and an approximate place on the map.",
        readout: [
          ["Form", snapshot.device.deviceType],
          ["OS", snapshot.device.osLabel],
          ["Browser", snapshot.device.browserLabel]
        ]
      },
      {
        tag: "SYSTEM BAR",
        title: "The bar at the edge.",
        copy: "A clock, a battery icon, a network glyph. Each one is ordinary UI to you and a data point to a page. This is the part of the device the web can actually measure.",
        readout: [
          ["Local time", formatLiveTime()],
          ["Power", batteryText],
          ["Network", snapshot.networkDisplay || snapshot.typeDisplay]
        ]
      },
      {
        tag: "THE EDGE",
        title: "The line you cannot see.",
        copy: "The reconstruction ends where the browser sandbox begins. Your Wi-Fi name, notification queue, files and apps stay on the other side. The interface is illustrative; the values are not.",
        readout: [
          ["Wi-Fi name", "Hidden by browser"],
          ["Installed apps", "Not exposed"],
          ["Wallpaper", "Illustrative reconstruction"]
        ]
      }
    ];
  }

  function setEdgeStage(stage, options) {
    const opts = options || {};
    const stages = getEdgeStages();
    const index = clamp(Number(stage) || 0, 0, 2);
    state.edgeStage = index;
    if (els.edgePin) els.edgePin.dataset.stage = String(index);
    if (els.edgeStageNum) els.edgeStageNum.textContent = String(index + 1).padStart(2, "0");
    if (els.edgeStageTag) els.edgeStageTag.textContent = stages[index].tag;
    if (els.edgeStepTitle) els.edgeStepTitle.textContent = stages[index].title;
    if (els.edgeStepCopy) els.edgeStepCopy.textContent = stages[index].copy;
    if (els.edgeReadout) {
      els.edgeReadout.innerHTML = stages[index].readout.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value || "—")}</dd></div>`).join("");
    }
    $$(".edge-step").forEach((button) => {
      const active = Number(button.dataset.edgeStep) === index;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (opts.scroll && !reduceMotion) scrollToEdgeStage(index);
  }

  function updateEdgeStageFromScroll() {
    if (!els.edgeScroll || reduceMotion) return;
    const header = $(".site-header");
    const headerHeight = header ? header.offsetHeight : 0;
    const rect = els.edgeScroll.getBoundingClientRect();
    const scrollHeight = els.edgeScroll.offsetHeight;
    const travel = Math.max(1, scrollHeight - window.innerHeight);
    const start = window.scrollY + rect.top - headerHeight;
    const progress = clamp((window.scrollY - start) / travel, 0, 1);
    if (els.edgeProgressBar) els.edgeProgressBar.style.width = `${Math.round(progress * 100)}%`;
    const stage = progress < 0.28 ? 0 : progress < 0.58 ? 1 : 2;
    if (stage !== state.edgeStage) setEdgeStage(stage, { scroll: false });
    else updateEdgeStageDynamicValues();
  }

  function updateEdgeStageDynamicValues() {
    if (!state.snapshot || state.edgeStage !== 1) return;
    // Keep the clock on the device honest without re-rendering the entire stage.
    updateDeviceClocks();
  }

  function scrollToEdgeStage(stage) {
    if (!els.edgeScroll) return;
    const header = $(".site-header");
    const headerHeight = header ? header.offsetHeight : 0;
    const rect = els.edgeScroll.getBoundingClientRect();
    const start = window.scrollY + rect.top - headerHeight;
    const travel = Math.max(1, els.edgeScroll.offsetHeight - window.innerHeight);
    const amount = stage === 0 ? 0.02 : stage === 1 ? 0.4 : 0.74;
    window.scrollTo({
      top: start + travel * amount,
      behavior: reduceMotion ? "auto" : "smooth"
    });
  }

  function renderFixesForScore() {
    if (!state.score) return;
    updateProjection();
  }

  function renderLedger() {
    if (!state.snapshot) {
      showToast("The passive scan is still running. Try again in a moment.");
      return;
    }
    const tbody = els.ledgerTableBody;
    if (!tbody) return;
    const reach = window.WTS_DATA.REACH;
    const categoryOrder = window.WTS_DATA.CATEGORY_ORDER;
    const signals = state.snapshot.signals.slice().sort((a, b) => {
      return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    });

    tbody.innerHTML = signals.map((signal) => {
      const meta = window.WTS_DATA.CATEGORIES[signal.category] || { label: "Other" };
      const reachMeta = reach[signal.reach] || reach.hidden;
      return `
        <tr>
          <td><strong>${escapeHtml(signal.label)}</strong><span class="ledger-category">${escapeHtml(meta.label)}</span></td>
          <td class="ledger-value">${escapeHtml(signal.value)}</td>
          <td>${escapeHtml(signal.source)}</td>
          <td><span class="reach-chip ${escapeHtml(reachMeta.className)}">${escapeHtml(reachMeta.label)}</span></td>
        </tr>
      `;
    }).join("");

    if (els.ledgerSearch) {
      els.ledgerSearch.value = "";
      filterLedger("");
    }
  }

  function filterLedger(term) {
    const rows = $$("#ledgerTableBody tr");
    const normalized = (term || "").trim().toLowerCase();
    let count = 0;
    rows.forEach((row) => {
      const visible = !normalized || row.textContent.toLowerCase().includes(normalized);
      row.hidden = !visible;
      if (visible) count += 1;
    });
    if (els.ledgerResultCount) els.ledgerResultCount.textContent = `${count} ${count === 1 ? "row" : "rows"}`;
    if (els.ledgerEmpty) els.ledgerEmpty.hidden = count !== 0;
  }

  function updateMethodPanel() {
    const snapshot = state.snapshot;
    if (!snapshot) {
      if (els.methodRequests) els.methodRequests.textContent = "—";
      if (els.methodProvider) els.methodProvider.textContent = "Pending";
      if (els.methodSignals) els.methodSignals.textContent = "—";
      if (els.methodTime) els.methodTime.textContent = "—";
      if (els.methodRequestLog) els.methodRequestLog.innerHTML = '<p class="request-log-empty">The passive scan has not finished yet.</p>';
      return;
    }
    const observed = snapshot.signals.filter((signal) => signal.observed).length;
    if (els.methodRequests) els.methodRequests.textContent = String(snapshot.requestCount);
    if (els.methodProvider) els.methodProvider.textContent = snapshot.meta.provider || "None reached";
    if (els.methodSignals) els.methodSignals.textContent = `${observed} observed / ${snapshot.signals.length} checked`;
    if (els.methodTime) els.methodTime.textContent = formatStamp(snapshot.finishedAt);
    if (els.methodRequestLog) {
      if (!state.sessionLog.length) {
        els.methodRequestLog.innerHTML = '<p class="request-log-empty">No outbound IP lookup was recorded for this visit.</p>';
      } else {
        els.methodRequestLog.innerHTML = state.sessionLog.map((entry) => `
          <div class="request-log-row">
            <span class="request-status request-${escapeHtml(entry.outcome)}" aria-hidden="true"></span>
            <div class="request-log-main">
              <strong>${escapeHtml(entry.provider || "IP lookup")}</strong>
              <span>${escapeHtml(entry.host || "—")} · scan ${escapeHtml(entry.scan || 1)}</span>
            </div>
            <code>${escapeHtml((entry.outcome || "unknown").toUpperCase())}${entry.ms ? ` · ${escapeHtml(entry.ms)} ms` : ""}</code>
            <time>${escapeHtml(formatShortStamp(entry.at))}</time>
          </div>
        `).join("");
      }
    }
  }

  function renderDeviceChromeOnce() {
    // Device values are refreshed by renderDevice after each scan.
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    document.body.classList.add("modal-open");
    const focusTarget = $(".modal-close", dialog);
    if (focusTarget) window.setTimeout(() => focusTarget.focus(), 20);
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
    document.body.classList.remove("modal-open");
  }

  function openMethod(targetId) {
    updateMethodPanel();
    openDialog(els.methodDialog);
    if (targetId) {
      const target = document.getElementById(targetId);
      const shell = els.methodDialog?.querySelector(".modal-shell");
      if (target && shell) {
        window.setTimeout(() => {
          shell.scrollTo({ top: Math.max(0, target.offsetTop - 24), behavior: reduceMotion ? "auto" : "smooth" });
        }, 60);
      }
    }
  }

  function exportScan() {
    if (!state.snapshot) {
      showToast("The scan is still running. Nothing to export yet.");
      return;
    }
    const payload = {
      site: "WhatTheySee",
      generatedAt: new Date().toISOString(),
      privacyNote: "Generated locally in the browser. No scan data was uploaded. The only outbound request was the IP lookup documented in requestLog.",
      scan: state.snapshot
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    link.href = url;
    link.download = `whattheysee-scan-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Keep the blob alive long enough for the browser to finish writing the
    // file. Revoking it after one second can cancel the download outright.
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    showToast("Scan exported locally. Nothing was uploaded.");
  }

  async function copyText(text) {
    if (!text) return false;
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // Fall through to the legacy path.
      }
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    } catch (error) {
      return false;
    }
  }

  function setTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    state.theme = next;
    document.documentElement.setAttribute("data-theme", next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "light" ? "#f3f6fb" : "#060b13");
    if (els.themeToggle) {
      const label = next === "dark" ? "Switch to light mode" : "Switch to dark mode";
      els.themeToggle.setAttribute("aria-label", label);
      els.themeToggle.title = label;
    }
    try {
      localStorage.setItem("wts-theme", next);
    } catch (error) {
      // Theme simply will not persist.
    }
  }

  function toggleMenu(force) {
    const isOpen = typeof force === "boolean" ? force : !document.body.classList.contains("menu-open");
    document.body.classList.toggle("menu-open", isOpen);
    if (els.menuButton) {
      els.menuButton.setAttribute("aria-expanded", String(isOpen));
      els.menuButton.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
      els.menuButton.title = isOpen ? "Close menu" : "Open menu";
    }
    if (isOpen) {
      const firstLink = $(".main-nav a", document);
      if (firstLink) window.setTimeout(() => firstLink.focus(), 40);
    }
  }

  function onScroll() {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = maxScroll > 0 ? clamp(window.scrollY / maxScroll, 0, 1) : 0;
    if (els.scrollProgress) els.scrollProgress.style.transform = `scaleX(${ratio})`;
    if (els.siteHeader) els.siteHeader.classList.toggle("is-scrolled", window.scrollY > 18);
    updateActiveNav();
    updateEdgeStageFromScroll();
  }

  function updateActiveNav() {
    const sections = $$("main section[id]").filter((section) => section.id);
    if (!sections.length) return;
    const threshold = window.innerHeight * 0.36;
    let activeId = null;
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= threshold) activeId = section.id;
    });
    const navMapping = {
      scan: "scan",
      device: "device",
      fingerprint: "fingerprint",
      fix: "fix",
      evidence: "evidence"
    };
    let navId = activeId;
    if (activeId && !navMapping[activeId]) {
      const order = ["scan", "device", "fingerprint", "fix", "evidence"];
      const index = order.indexOf(activeId);
      if (index === -1) {
        if (activeId === "permissions") navId = "device";
        else if (activeId === "dossier") navId = "fingerprint";
        else navId = null;
      }
    }
    $$(".main-nav a").forEach((link) => {
      const target = link.getAttribute("href")?.replace("#", "");
      const selected = target && target === navMapping[navId];
      link.classList.toggle("is-active", Boolean(selected));
      if (selected) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }

  function initReveal() {
    const elements = $$(".reveal");
    if (!elements.length) return;
    // The hero is always above the fold. Start its entrance immediately so
    // content never waits on an IntersectionObserver callback.
    elements.forEach((element) => {
      if (element.closest(".hero")) element.classList.add("is-visible");
    });
    if (reduceMotion || typeof IntersectionObserver !== "function") {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -7% 0px" });
    elements.forEach((element) => {
      if (!element.classList.contains("is-visible")) observer.observe(element);
    });
  }

  function initHeroMotion() {
    const visual = $(".hero-visual");
    const card = $(".hero-card");
    if (!visual || !card || reduceMotion) return;

    let frame = 0;
    let latest = null;

    const apply = () => {
      frame = 0;
      if (!latest) return;
      const rect = visual.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.min(1, Math.max(0, (latest.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (latest.clientY - rect.top) / rect.height));
      visual.style.setProperty("--mx", `${(x * 100).toFixed(2)}%`);
      visual.style.setProperty("--my", `${(y * 100).toFixed(2)}%`);
      card.style.setProperty("--rx", `${((0.5 - y) * 4.5).toFixed(2)}deg`);
      card.style.setProperty("--ry", `${((x - 0.5) * 6).toFixed(2)}deg`);
    };

    const reset = () => {
      latest = null;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      visual.style.removeProperty("--mx");
      visual.style.removeProperty("--my");
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    };

    visual.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      latest = event;
      if (!frame) frame = window.requestAnimationFrame(apply);
    }, { passive: true });

    visual.addEventListener("pointerleave", reset);
    visual.addEventListener("pointercancel", reset);
  }

  function bindEvents() {
    if (els.themeToggle) {
      const initialLabel = state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
      els.themeToggle.setAttribute("aria-label", initialLabel);
      els.themeToggle.title = initialLabel;
      els.themeToggle.addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
    }

    if (els.menuButton) {
      els.menuButton.addEventListener("click", () => toggleMenu());
      $$(".main-nav a").forEach((link) => link.addEventListener("click", () => toggleMenu(false)));
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && document.body.classList.contains("menu-open")) {
        toggleMenu(false);
        els.menuButton?.focus();
      }
    });

    document.addEventListener("click", (event) => {
      if (!document.body.classList.contains("menu-open")) return;
      if (event.target.closest(".site-header")) return;
      toggleMenu(false);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 980 && document.body.classList.contains("menu-open")) toggleMenu(false);
      updateActiveNav();
      updateEdgeStageFromScroll();
    }, { passive: true });

    if (els.rescanBtn) els.rescanBtn.addEventListener("click", () => runScan({ rescan: true }));
    if (els.exportJson) els.exportJson.addEventListener("click", exportScan);
    if (els.ledgerExportJson) els.ledgerExportJson.addEventListener("click", exportScan);

    if (els.openLedger) {
      els.openLedger.addEventListener("click", () => {
        if (!state.snapshot) {
          showToast("The passive scan is still running. The raw ledger will unlock when it finishes.");
          return;
        }
        renderLedger();
        openDialog(els.ledgerDialog);
      });
    }
    if (els.ledgerSearch) {
      els.ledgerSearch.addEventListener("input", () => filterLedger(els.ledgerSearch.value));
    }

    $$("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => closeDialog(button.closest("dialog")));
    });
    [els.ledgerDialog, els.methodDialog].forEach((dialog) => {
      if (!dialog) return;
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
      dialog.addEventListener("close", () => {
        if (!$$("dialog[open]").length) document.body.classList.remove("modal-open");
      });
    });

    const methodTriggers = [
      [els.openMethodScore, "methodScore"],
      [els.openNetworkMethod, "methodRequests"],
      [els.openMethodOath, "methodPrivacy"],
      [els.openMethodEvidence, "methodAccuracy"],
      [els.openMethodFooter, null]
    ];
    methodTriggers.forEach(([button, targetId]) => {
      if (button) button.addEventListener("click", () => openMethod(targetId || ""));
    });

    if (els.copyHash) {
      els.copyHash.addEventListener("click", async () => {
        const hash = state.snapshot?.fingerprint?.hash;
        if (!hash) return;
        const copied = await copyText(hash);
        if (!copied) {
          showToast("Copy was blocked by the browser. The hash is selectable above.");
          return;
        }
        const label = els.copyHash.querySelector("span");
        if (label) label.textContent = "Copied";
        window.setTimeout(() => {
          if (label) label.textContent = "Copy";
        }, 1600);
        showToast("Fingerprint hash copied locally.");
      });
    }

    if (els.fixReset) {
      els.fixReset.addEventListener("click", () => {
        state.checkedFixes.clear();
        try {
          localStorage.removeItem("wts-fixes");
        } catch (error) {
          // Ignore storage failures.
        }
        syncFixChecks();
        updateProjection();
        showToast("Checklist reset. The projection is back to the current read.");
      });
    }

    $$(".edge-step").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.edgeStep) || 0;
        setEdgeStage(index, { scroll: !reduceMotion });
        if (reduceMotion) setEdgeStage(index, { scroll: false });
      });
    });

    if (els.skipZoom) {
      els.skipZoom.addEventListener("click", () => {
        setEdgeStage(2, { scroll: false });
        const target = document.getElementById("permissions");
        if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      });
    }
  }

  function cacheElements() {
    const ids = [
      "themeToggle", "menuButton", "mainNav", "scrollProgress", "siteHeader",
      "heroStatus", "heroStatusText", "heroStatusMeta", "heroSignals", "heroPermissions", "heroRequests", "heroRequestsLabel",
      "heroFingerprint", "heroBrowser", "heroScore", "heroScoreLabel", "heroRing", "heroLocation", "heroIsp",
      "heroTime", "heroNetworkType", "heroDisplay", "heroHash", "heroFindings", "heroCoordA", "heroCoordB",
      "scanBadge", "scanStatusText", "scanTimestamp", "rescanBtn", "openLedger", "exportJson", "scoreValue",
      "scoreDial", "scoreBand", "scoreCopy", "scoreConfidence", "categoryBars", "manifestDevice", "manifestBrowser",
      "manifestPlatform", "manifestScreen", "manifestGpu", "manifestTouch", "receiptIp", "receiptLocation",
      "receiptIsp", "receiptTz", "lookupProvider", "receiptTime", "mapDot", "mapLabel", "signalGrid", "signalCount",
      "fingerprintHash", "copyHash", "hashStatusChip", "hashReplay", "fingerprintComponents", "fingerprintComponentCount",
      "dossierNarrative", "dossierDevice", "dossierLocation", "dossierTime", "dossierNetwork", "dossierScreen",
      "dossierSignature", "dossierFileNo", "dossierTimestamp", "currentScore", "projectedScore", "fixList", "fixReset",
      "fixProgressCount", "fixTotal", "fixProgressBar", "fixProgressText", "edgeScroll", "edgePin", "edgeStageNum",
      "edgeStageTag", "edgeStepTitle", "edgeStepCopy", "edgeReadout", "edgeForm", "edgeOs", "edgeBrowser",
      "edgeNetworkDesktop", "edgeNetworkTaskbar", "edgeBatteryDesktop", "edgeBatteryTaskbar", "edgeBatteryFillDesktop",
      "edgeBatteryFillTaskbar", "edgeBatteryFillMobile", "edgeClockDesktop", "edgeClockTaskbar", "edgeClockMobile",
      "edgeBigTimeMobile", "edgeDateMobile", "edgeWindowScore", "edgeWindowScoreMobile", "edgeCalloutOs",
      "edgeCalloutScreen", "edgeCalloutNetwork", "edgeCalloutBattery", "edgeProgressBar", "skipZoom", "deviceFrame",
      "ledgerDialog", "openMethodScore", "openNetworkMethod", "openMethodOath", "openMethodEvidence", "openMethodFooter",
      "methodDialog", "methodRequests", "methodProvider", "methodSignals", "methodTime", "methodRequestLog",
      "ledgerSearch", "ledgerTableBody", "ledgerResultCount", "ledgerEmpty", "ledgerExportJson", "toast", "footerYear"
    ];
    ids.forEach((id) => {
      els[id] = document.getElementById(id);
    });
    els.siteHeader = document.querySelector(".site-header");
    els.toast = document.getElementById("toast");
  }

  function initialize() {
    cacheElements();
    renderFixes();
    bindEvents();
    initReveal();
    initHeroMotion();
    onScroll();

    window.addEventListener("scroll", () => {
      window.requestAnimationFrame(onScroll);
    }, { passive: true });

    window.setInterval(updateLiveClocks, 20000);

    // Initial state for everything that depends on a finished scan.
    if (els.fixTotal) els.fixTotal.textContent = String(window.WTS_DATA.FIXES.length);
    if (els.footerYear) els.footerYear.textContent = String(new Date().getFullYear());
    setScanningUi(true, false);
    updateProjection();
    updateMethodPanel();
    document.body.classList.add("has-loaded");
    runScan({ rescan: false });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
