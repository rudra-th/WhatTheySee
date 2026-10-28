/* =========================================================
   WhatTheySee — exposure index
   Weighted signal availability, not a risk verdict.
   ========================================================= */

(function () {
  "use strict";

  const BAND_COPY = {
    narrow: "A narrower introduction. Many channels stayed closed or unanswered.",
    limited: "Some limits are working. Enough remains to make useful comparisons.",
    elevated: "A recognisable silhouette. This is roughly the default surface of the modern web.",
    distinctive: "Stable, varied signals. A network could compare this visit to another with reasonable confidence.",
    wide: "Nearly every passive channel answered. The browser volunteered a detailed introduction."
  };

  function scorePresence(snapshot) {
    const device = snapshot.device;
    const display = snapshot.display;
    const locale = snapshot.locale;
    const ip = snapshot.ip;
    const network = snapshot.network;
    const fingerprint = snapshot.fingerprint;
    const capabilities = snapshot.capabilities;
    const battery = snapshot.battery;

    const checks = {
      network: [
        { id: "ip", points: 4, ok: Boolean(ip?.ip), label: "IP" },
        { id: "isp", points: 3, ok: Boolean(ip?.isp), label: "ISP" },
        { id: "asn", points: 2, ok: Boolean(ip?.asn), label: "ASN" },
        { id: "type", points: 2, ok: Boolean(network.typeLabel), label: "Radio" },
        { id: "effective", points: 1, ok: Boolean(network.effectiveType), label: "Class" },
        { id: "downlink", points: 2, ok: network.downlink !== null, label: "Downlink" },
        { id: "rtt", points: 1, ok: network.rtt !== null, label: "Latency" }
      ],
      precision: [
        { id: "city", points: 2, ok: Boolean(ip?.city), label: "City" },
        { id: "region", points: 1, ok: Boolean(ip?.region), label: "Region" },
        { id: "country", points: 2, ok: Boolean(ip?.country), label: "Country" },
        { id: "coordinates", points: 2, ok: Boolean(ip) && ip.latitude !== null && ip.longitude !== null, label: "Coords" },
        { id: "browserTz", points: 1, ok: Boolean(locale.timezone), label: "Time zone" },
        { id: "ipTz", points: 1, ok: Boolean(ip?.timezone), label: "IP zone" },
        { id: "alignment", points: 1, ok: snapshot.timezoneAlign === true, label: "Aligned" }
      ],
      device: [
        { id: "os", points: 2, ok: Boolean(device.osName && device.osName !== "Unknown OS"), label: "OS" },
        { id: "browser", points: 2, ok: Boolean(device.browserName), label: "Browser" },
        { id: "engine", points: 1, ok: Boolean(device.engine && device.engine !== "Unknown engine"), label: "Engine" },
        { id: "form", points: 1, ok: Boolean(device.deviceType), label: "Form" },
        { id: "arch", points: 1, ok: Boolean(device.architecture), label: "Arch" },
        { id: "cpu", points: 2, ok: Boolean(device.hardwareConcurrency), label: "CPU" },
        { id: "memory", points: 2, ok: Boolean(device.deviceMemory), label: "Memory" },
        { id: "gpu", points: 2, ok: Boolean(fingerprint.webgl.renderer), label: "GPU" },
        { id: "webgpu", points: 1, ok: Boolean(snapshot.webgpu?.supported), label: "WebGPU" },
        { id: "model", points: 1, ok: Boolean(device.model), label: "Model" }
      ],
      display: [
        { id: "screen", points: 2, ok: Boolean(display.screenWidth), label: "Screen" },
        { id: "dpr", points: 2, ok: Boolean(display.devicePixelRatio), label: "DPR" },
        { id: "viewport", points: 1, ok: Boolean(display.viewportWidth), label: "Viewport" },
        { id: "colour", points: 1, ok: Boolean(display.colorDepth), label: "Colour" },
        { id: "touch", points: 1, ok: true, label: "Input" },
        { id: "mode", points: 1, ok: Boolean(display.displayMode), label: "Mode" }
      ],
      locale: [
        { id: "language", points: 2, ok: Boolean(locale.language), label: "Language" },
        { id: "languages", points: 1, ok: locale.languages.length > 0, label: "List" },
        { id: "timezone", points: 2, ok: Boolean(locale.timezone), label: "Time zone" },
        { id: "calendar", points: 1, ok: Boolean(locale.calendar), label: "Calendar" },
        { id: "offset", points: 1, ok: Boolean(locale.offsetLabel), label: "Offset" }
      ],
      fingerprint: [
        { id: "canvas", points: 6, ok: fingerprint.canvas.supported, label: "Canvas" },
        { id: "webgl", points: 5, ok: fingerprint.webgl.supported, label: "WebGL" },
        { id: "audio", points: 4, ok: fingerprint.audio.supported, label: "Audio" },
        { id: "fonts", points: 5, ok: fingerprint.fonts.matched.length > 0, label: "Fonts" },
        { id: "hash", points: 3, ok: Boolean(fingerprint.hash), label: "Hash" },
        { id: "replay", points: 2, ok: fingerprint.replay === "stable in this session", label: "Replay" }
      ],
      battery: [
        { id: "api", points: 1, ok: battery.supported, label: "API" },
        { id: "level", points: 3, ok: battery.level !== null && battery.level !== undefined, label: "Level" },
        { id: "charging", points: 2, ok: battery.charging !== null && battery.charging !== undefined, label: "State" }
      ],
      surface: [
        { id: "cookies", points: 1, ok: true, label: "Storage" },
        { id: "dnt", points: 1, ok: capabilities.doNotTrack !== null || capabilities.gpc === true, label: "Opt-out" },
        { id: "transport", points: 1, ok: Boolean(capabilities.transport), label: "Transport" },
        { id: "secure", points: 1, ok: Boolean(capabilities.secureContext), label: "Secure" },
        { id: "permissions", points: 3, ok: capabilities.permissions.supported, label: "Permissions" },
        { id: "storage", points: 3, ok: capabilities.storage.supported, label: "Quota" },
        { id: "media", points: 2, ok: capabilities.mediaDevices.supported, label: "Devices" },
        { id: "pdf", points: 1, ok: capabilities.pdfViewerEnabled !== null, label: "PDF" },
        { id: "isolated", points: 1, ok: true, label: "Isolation" }
      ]
    };

    const weightMap = {
      network: 15,
      precision: 10,
      device: 15,
      display: 8,
      locale: 7,
      fingerprint: 25,
      battery: 6,
      surface: 14
    };

    const labelMap = {
      network: "Network",
      precision: "Precision",
      device: "Device",
      display: "Display",
      locale: "Context",
      fingerprint: "Fingerprint",
      battery: "Battery",
      surface: "Surface"
    };

    const categories = {};
    let total = 0;

    Object.keys(checks).forEach((key) => {
      const weight = weightMap[key];
      const points = checks[key].reduce((sum, item) => sum + (item.ok ? item.points : 0), 0);
      total += points;
      categories[key] = {
        id: key,
        label: labelMap[key],
        weight,
        points,
        percent: Math.round((points / weight) * 100),
        observed: checks[key].filter((item) => item.ok).length,
        checked: checks[key].length,
        missing: checks[key].filter((item) => !item.ok).map((item) => item.label)
      };
    });

    const score = Math.max(0, Math.min(100, Math.round(total)));
    const band = window.WTS_DATA.BANDS.find((item) => score >= item.min && score <= item.max) || window.WTS_DATA.BANDS[2];

    return {
      score,
      band,
      categories,
      checks,
      categoryOrder: ["network", "precision", "device", "display", "locale", "fingerprint", "battery", "surface"],
      totalWeight: 100
    };
  }

  function project(score, checkedFixIds) {
    const data = window.WTS_DATA;
    const completed = new Set(checkedFixIds || []);
    let reduction = 0;
    const applied = [];
    data.FIXES.forEach((fix) => {
      if (completed.has(fix.id)) {
        reduction += fix.impact;
        applied.push(fix);
      }
    });
    const projected = Math.max(12, Math.round(score - reduction));
    const band = data.BANDS.find((item) => projected >= item.min && projected <= item.max) || data.BANDS[0];
    return {
      score: projected,
      reduction,
      applied,
      band
    };
  }

  window.WTSScore = {
    compute: scorePresence,
    project,
    bandCopy: BAND_COPY
  };
})();
