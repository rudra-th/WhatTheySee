/* =========================================================
   WhatTheySee — passive signal collectors
   Everything below is read from standard browser APIs.
   No permission is requested. No scan data is stored.
   ========================================================= */

(function () {
  "use strict";

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const PERMISSION_QUERIES = [
    { name: "geolocation", label: "Geolocation" },
    { name: "notifications", label: "Notifications" },
    { name: "camera", label: "Camera" },
    { name: "microphone", label: "Microphone" },
    { name: "clipboard-read", label: "Clipboard read" },
    { name: "clipboard-write", label: "Clipboard write" },
    { name: "bluetooth", label: "Bluetooth" },
    { name: "midi", label: "MIDI devices" },
    { name: "persistent-storage", label: "Persistent storage" },
    { name: "accelerometer", label: "Accelerometer" },
    { name: "gyroscope", label: "Gyroscope" },
    { name: "magnetometer", label: "Magnetometer" },
    { name: "background-sync", label: "Background sync" },
    { name: "local-fonts", label: "Local fonts" },
    { name: "window-management", label: "Window management" }
  ];

  const PROBE_FONTS = [
    "Arial", "Arial Black", "Arial Narrow", "Baskerville", "Calibri", "Cambria", "Candara",
    "Comic Sans MS", "Consolas", "Courier New", "DejaVu Sans", "Didot", "Futura", "Geneva",
    "Georgia", "Gill Sans", "Helvetica Neue", "Hoefler Text", "Impact", "Liberation Sans",
    "Lucida Console", "Lucida Grande", "Lucida Sans Unicode", "Menlo", "Microsoft Sans Serif",
    "Monaco", "Noto Sans", "Optima", "Palatino Linotype", "Roboto", "SF Pro Display",
    "SF Pro Text", "Segoe Print", "Segoe Script", "Segoe UI", "Tahoma", "Times New Roman",
    "Trebuchet MS", "Ubuntu", "Verdana", "Webdings", "Wingdings"
  ];

  const queriedPermissionStatus = {
    supported: false,
    entries: [],
    granted: 0,
    denied: 0,
    prompt: 0,
    unsupported: 0
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function safe(fn, fallback) {
    try {
      const value = fn();
      return value === undefined || value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function formatBytes(bytes) {
    if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return null;
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
  }

  function formatMegabits(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return `${value.toFixed(value < 10 ? 1 : 0)} Mbps (estimated)`;
  }

  function formatOffset(offsetMinutes) {
    if (typeof offsetMinutes !== "number") return null;
    const sign = offsetMinutes <= 0 ? "+" : "−";
    const absolute = Math.abs(offsetMinutes);
    const hours = Math.floor(absolute / 60);
    const minutes = absolute % 60;
    return `UTC${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function compactDate(date) {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(date);
  }

  function localTimeString(date) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(date);
  }

  function dateTimeString(date) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(date);
  }

  function timezoneParts(date) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZoneName: "short",
        hour: "2-digit",
        minute: "2-digit"
      }).formatToParts(date);
      return parts.find((part) => part.type === "timeZoneName")?.value || "";
    } catch (error) {
      return "";
    }
  }

  function cyrb53(input, seed) {
    let h1 = 0xdeadbeef ^ (seed || 0);
    let h2 = 0x41c6ce57 ^ (seed || 0);
    const text = String(input);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ((h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0"));
  }

  function detectBrowser() {
    const ua = navigator.userAgent || "";
    const uaData = navigator.userAgentData || null;
    const brands = uaData && Array.isArray(uaData.brands) ? uaData.brands : [];
    let name = "Unknown browser";
    let version = "";

    const tests = [
      { name: "Microsoft Edge", re: /Edg(?:A|iOS)?\/([\d.]+)/ },
      { name: "Opera", re: /OPR\/([\d.]+)/ },
      { name: "Samsung Internet", re: /SamsungBrowser\/([\d.]+)/ },
      { name: "Firefox", re: /(?:Firefox|FxiOS)\/([\d.]+)/ },
      { name: "Chrome", re: /(?:Chrome|CriOS)\/([\d.]+)/ }
    ];

    for (const test of tests) {
      const match = ua.match(test.re);
      if (match) {
        name = test.name;
        version = match[1];
        break;
      }
    }

    if (name === "Unknown browser" && /Safari\//.test(ua) && /Version\/([\d.]+)/.test(ua)) {
      name = "Safari";
      version = ua.match(/Version\/([\d.]+)/)[1];
    }

    if (name === "Unknown browser" && brands.length) {
      const meaningful = brands.find((brand) => !/not.?a.?brand/i.test(brand.brand) && !/^chromium$/i.test(brand.brand));
      if (meaningful) {
        name = meaningful.brand;
        version = meaningful.version || "";
      }
    }

    if (/iPhone|iPad|iPod/.test(ua)) {
      if (/CriOS\//.test(ua)) name = "Chrome iOS";
      if (/FxiOS\//.test(ua)) name = "Firefox iOS";
      if (/EdgiOS\//.test(ua)) name = "Microsoft Edge iOS";
    }

    if (uaData && Array.isArray(uaData.brands)) {
      const edge = uaData.brands.find((brand) => /Microsoft Edge/i.test(brand.brand));
      if (edge) {
        name = "Microsoft Edge";
        version = edge.version || version;
      }
    }

    let engine = "Unknown engine";
    if (/Gecko\/|Firefox\//.test(ua) && !/like Gecko/.test(ua)) engine = "Gecko";
    else if (/AppleWebKit\//.test(ua) && /Chrome|CriOS|Edg|OPR/.test(ua)) engine = "Blink";
    else if (/AppleWebKit\//.test(ua)) engine = "WebKit";
    else if (/Trident\//.test(ua)) engine = "Trident";

    let osName = "Unknown OS";
    let osVersion = "";
    let osKey = "other";

    if (/Windows NT 10\.0/.test(ua)) {
      osName = "Windows";
      osVersion = "10";
      osKey = "windows";
    } else if (/Windows NT 6\.3/.test(ua)) {
      osName = "Windows";
      osVersion = "8.1";
      osKey = "windows";
    } else if (/Windows/.test(ua)) {
      osName = "Windows";
      osKey = "windows";
    } else if (/CrOS/.test(ua)) {
      osName = "ChromeOS";
      osKey = "chromeos";
    } else if (/Android/.test(ua)) {
      osName = "Android";
      osVersion = (ua.match(/Android\s([\d.]+)/) || [])[1] || "";
      osKey = "android";
    } else if (/iPhone|iPad|iPod/.test(ua)) {
      osName = /iPad/.test(ua) ? "iPadOS" : "iOS";
      osVersion = (ua.match(/OS\s([\d_]+)/) || [])[1]?.replace(/_/g, ".") || "";
      osKey = "ios";
    } else if (/Mac OS X/.test(ua)) {
      osName = "macOS";
      osVersion = (ua.match(/Mac OS X\s([\d_.]+)/) || [])[1]?.replace(/_/g, ".") || "";
      osKey = "macos";
    } else if (/Linux/.test(ua)) {
      osName = "Linux";
      osKey = "linux";
    }

    if (uaData && uaData.platform) {
      const platform = uaData.platform;
      if (/Windows/i.test(platform)) {
        osName = "Windows";
        osKey = "windows";
      } else if (/macOS/i.test(platform)) {
        osName = "macOS";
        osKey = "macos";
      } else if (/Android/i.test(platform)) {
        osName = "Android";
        osKey = "android";
      } else if (/Chrome OS/i.test(platform)) {
        osName = "ChromeOS";
        osKey = "chromeos";
      } else if (/Linux/i.test(platform)) {
        osName = "Linux";
        osKey = "linux";
      }
    }

    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1 && osName === "macOS") {
      osName = "iPadOS";
      osKey = "ios";
    }

    return {
      name,
      version,
      label: version ? `${name} ${version.split(".").slice(0, 2).join(".")}` : name,
      engine,
      osName,
      osVersion,
      osLabel: osVersion ? `${osName} ${osVersion}` : osName,
      osKey
    };
  }

  function getDeviceType(osKey) {
    const uaData = navigator.userAgentData;
    const mobile = uaData ? Boolean(uaData.mobile) : /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);
    const coarse = safe(() => window.matchMedia("(pointer: coarse)").matches, false);
    const width = window.innerWidth || 0;
    const touch = navigator.maxTouchPoints || 0;
    const desktopOS = osKey === "windows" || osKey === "macos" || osKey === "linux" || osKey === "chromeos";

    if (osKey === "ios" && /iPad/.test(navigator.userAgent)) return "Tablet";
    if (osKey === "ios" || osKey === "android") {
      return coarse && width > 820 ? "Tablet" : "Phone";
    }
    // Touch points on a desktop OS usually mean a touchscreen laptop or a
    // 2-in-1. They do not make the device a tablet, so let the OS decide.
    if (desktopOS) {
      if (mobile) return "Phone";
      if (touch > 1 && width <= 1024) return "Laptop / 2-in-1";
      return width >= 1200 ? "Desktop" : "Laptop / small display";
    }
    if (touch > 1 && width <= 1024) return "Tablet";
    if (mobile) return "Phone";
    return width >= 1200 ? "Desktop" : "Laptop / small display";
  }

  function getFormFactor(osKey) {
    if (osKey === "ios" || osKey === "android") return "phone";
    if (osKey === "windows" || osKey === "macos" || osKey === "linux" || osKey === "chromeos") return "desktop";
    const coarse = safe(() => window.matchMedia("(pointer: coarse)").matches, false);
    if (coarse && window.innerWidth <= 900) return "phone";
    return "desktop";
  }

  function networkTypeName(type) {
    if (!type) return null;
    const map = {
      wifi: "Wi-Fi",
      cellular: "Cellular",
      ethernet: "Ethernet",
      bluetooth: "Bluetooth",
      wimax: "WiMAX",
      none: "Offline",
      other: "Other network"
    };
    return map[type] || type;
  }

  function effectiveTypeName(type) {
    if (!type) return null;
    const map = {
      "slow-2g": "2G (slow)",
      "2g": "2G",
      "3g": "3G",
      "4g": "4G",
      "5g": "5G"
    };
    return map[type] || type.toUpperCase();
  }

  function shortenIsp(isp) {
    if (!isp) return null;
    return String(isp).split(",")[0].replace(/\b(Ltd\.?|Limited|Inc\.?|LLC|Pvt\.?|Private)\b/gi, "").replace(/\s{2,}/g, " ").trim();
  }

  function getHighEntropy() {
    if (!navigator.userAgentData || typeof navigator.userAgentData.getHighEntropyValues !== "function") {
      return Promise.resolve(null);
    }
    return navigator.userAgentData.getHighEntropyValues([
      "architecture",
      "bitness",
      "model",
      "platformVersion",
      "uaFullVersion",
      "fullVersionList",
      "wow64"
    ]).catch(() => null);
  }

  function collectWebgl() {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    let gl = null;
    try {
      gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    } catch (error) {
      gl = null;
    }
    if (!gl) {
      return {
        supported: false,
        vendor: null,
        renderer: null,
        version: null,
        shadingLanguage: null,
        maxTextureSize: null,
        maxViewport: null,
        hash: null
      };
    }

    const debug = safe(() => gl.getExtension("WEBGL_debug_renderer_info"), null);
    const vendor = safe(() => (debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)), null);
    const renderer = safe(() => (debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)), null);
    const version = safe(() => gl.getParameter(gl.VERSION), null);
    const shadingLanguage = safe(() => gl.getParameter(gl.SHADING_LANGUAGE_VERSION), null);
    const maxTexture = safe(() => gl.getParameter(gl.MAX_TEXTURE_SIZE), null);
    const maxViewport = safe(() => {
      const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      return viewport ? `${viewport[0]}×${viewport[1]}` : null;
    }, null);

    return {
      supported: true,
      vendor: vendor || null,
      renderer: renderer || null,
      version: version || null,
      shadingLanguage: shadingLanguage || null,
      maxTextureSize: maxTexture,
      maxViewport,
      hash: cyrb53([vendor, renderer, version, shadingLanguage, maxTexture, maxViewport].join("|"))
    };
  }

  function renderCanvasSample() {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 100;
    const context = canvas.getContext("2d");
    if (!context) return null;

    const gradient = context.createLinearGradient(0, 0, 360, 100);
    gradient.addColorStop(0, "#0a1422");
    gradient.addColorStop(0.55, "#183b52");
    gradient.addColorStop(1, "#5ef0cf");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.globalAlpha = 0.84;
    context.fillStyle = "#f1f7ff";
    context.font = "600 25px 'Arial'";
    context.textBaseline = "alphabetic";
    context.fillText("WhatTheySee · canvas 01", 16, 35);

    context.globalAlpha = 0.58;
    context.font = "14px 'Courier New'";
    context.fillText("silhouette :: stable-ish :: 2026", 17, 58);

    context.beginPath();
    context.arc(322, 48, 28, 0, Math.PI * 2);
    context.strokeStyle = "rgba(255,255,255,0.7)";
    context.lineWidth = 1.3;
    context.stroke();

    context.beginPath();
    context.moveTo(296, 82);
    context.bezierCurveTo(315, 58, 336, 81, 350, 50);
    context.strokeStyle = "rgba(132,237,220,0.9)";
    context.lineWidth = 2;
    context.stroke();

    context.globalCompositeOperation = "multiply";
    context.fillStyle = "rgba(255,200,120,0.35)";
    context.fillRect(22, 72, 180, 14);

    try {
      const data = canvas.toDataURL("image/png");
      return {
        hash: cyrb53(data),
        data,
        width: canvas.width,
        height: canvas.height
      };
    } catch (error) {
      return null;
    }
  }

  function probeFonts() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return { matched: [], supported: false };

    const test = "mmmmmmmmmmlliWQ@#";
    const size = "72px";
    const fallbacks = ["monospace", "serif", "sans-serif"];
    const baselines = {};

    fallbacks.forEach((fallback) => {
      context.font = `${size} ${fallback}`;
      baselines[fallback] = context.measureText(test).width;
    });

    const matched = PROBE_FONTS.filter((font) => {
      return fallbacks.some((fallback) => {
        context.font = `${size} "${font}", ${fallback}`;
        return Math.abs(context.measureText(test).width - baselines[fallback]) > 0.5;
      });
    });

    return {
      matched,
      supported: true,
      hash: cyrb53(matched.join("|"))
    };
  }

  async function renderAudioSample() {
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineContext) {
      return { supported: false, hash: null, sampleCount: 0 };
    }

    try {
      const context = new OfflineContext(1, 44100, 44100);
      const oscillator = context.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.value = 10000;

      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -50;
      compressor.knee.value = 40;
      compressor.ratio.value = 12;
      compressor.attack.value = 0;
      compressor.release.value = 0.25;

      oscillator.connect(compressor);
      compressor.connect(context.destination);
      oscillator.start(0);

      const timeout = new Promise((resolve) => {
        window.setTimeout(() => resolve(null), 4000);
      });

      const buffer = await Promise.race([context.startRendering(), timeout]);
      if (!buffer) {
        return { supported: false, hash: null, sampleCount: 0 };
      }

      const samples = buffer.getChannelData(0);
      const values = [];
      for (let index = 4500; index < 5000; index += 1) {
        values.push(Math.round(samples[index] * 1000000));
      }

      return {
        supported: true,
        hash: cyrb53(values.join(",")),
        sampleCount: values.length
      };
    } catch (error) {
      return { supported: false, hash: null, sampleCount: 0 };
    }
  }

  function collectPermissions() {
    queriedPermissionStatus.entries = [];
    queriedPermissionStatus.granted = 0;
    queriedPermissionStatus.denied = 0;
    queriedPermissionStatus.prompt = 0;
    queriedPermissionStatus.unsupported = 0;
    queriedPermissionStatus.queryable = 0;

    if (!navigator.permissions || typeof navigator.permissions.query !== "function") {
      queriedPermissionStatus.supported = false;
      return Promise.resolve(queriedPermissionStatus);
    }

    queriedPermissionStatus.supported = true;

    return Promise.all(
      PERMISSION_QUERIES.map((feature) => {
        return Promise.resolve()
          .then(() => navigator.permissions.query({ name: feature.name }))
          .then((status) => {
            const entry = {
              name: feature.name,
              label: feature.label,
              state: status.state,
              queryable: true
            };
            if (status.state === "granted") queriedPermissionStatus.granted += 1;
            else if (status.state === "denied") queriedPermissionStatus.denied += 1;
            else queriedPermissionStatus.prompt += 1;
            return entry;
          })
          .catch(() => {
            queriedPermissionStatus.unsupported += 1;
            return {
              name: feature.name,
              label: feature.label,
              state: "unsupported",
              queryable: false
            };
          });
      })
    ).then((entries) => {
      queriedPermissionStatus.entries = entries;
      queriedPermissionStatus.queryable = entries.filter((entry) => entry.queryable).length;
      return queriedPermissionStatus;
    });
  }

  async function collectMediaDevices() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== "function") {
      return { supported: false, counts: {}, total: 0 };
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const counts = { audioinput: 0, videoinput: 0, audiooutput: 0 };
      devices.forEach((device) => {
        if (Object.prototype.hasOwnProperty.call(counts, device.kind)) counts[device.kind] += 1;
      });
      return {
        supported: true,
        counts,
        total: devices.length,
        labelsWithheld: devices.every((device) => !device.label)
      };
    } catch (error) {
      return { supported: false, counts: {}, total: 0, error: true };
    }
  }

  async function collectStorageEstimate() {
    if (!navigator.storage || typeof navigator.storage.estimate !== "function") {
      return { supported: false, quota: null, usage: null, usagePercent: null };
    }
    try {
      const estimate = await navigator.storage.estimate();
      const quota = typeof estimate.quota === "number" ? estimate.quota : null;
      const usage = typeof estimate.usage === "number" ? estimate.usage : null;
      return {
        supported: quota !== null,
        quota,
        usage,
        quotaLabel: formatBytes(quota),
        usageLabel: formatBytes(usage),
        usagePercent: quota && usage !== null ? (usage / quota) * 100 : null
      };
    } catch (error) {
      return { supported: false, quota: null, usage: null, usagePercent: null };
    }
  }

  async function collectBattery() {
    if (!navigator.getBattery || typeof navigator.getBattery !== "function") {
      return { supported: false };
    }
    try {
      const timeout = new Promise((resolve) => {
        window.setTimeout(() => resolve(null), 3500);
      });
      const battery = await Promise.race([navigator.getBattery(), timeout]);
      if (!battery) return { supported: false, timedOut: true };
      return {
        supported: true,
        level: typeof battery.level === "number" ? Math.round(battery.level * 100) : null,
        charging: typeof battery.charging === "boolean" ? battery.charging : null,
        chargingTime: typeof battery.chargingTime === "number" && Number.isFinite(battery.chargingTime) ? battery.chargingTime : null,
        dischargingTime: typeof battery.dischargingTime === "number" && Number.isFinite(battery.dischargingTime) ? battery.dischargingTime : null
      };
    } catch (error) {
      return { supported: false, error: true };
    }
  }

  async function collectWebgpu() {
    if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== "function") {
      return { supported: false };
    }
    try {
      const timeout = new Promise((resolve) => {
        window.setTimeout(() => resolve(null), 2500);
      });
      const adapter = await Promise.race([navigator.gpu.requestAdapter(), timeout]);
      if (!adapter) return { supported: false, adapter: null };
      let info = null;
      if (adapter.info) {
        info = {
          vendor: adapter.info.vendor || null,
          architecture: adapter.info.architecture || null,
          device: adapter.info.device || null,
          description: adapter.info.description || null
        };
      }
      return { supported: true, adapter: info };
    } catch (error) {
      return { supported: false, error: true };
    }
  }

  function collectConnection() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) {
      return {
        supported: false,
        type: null,
        typeLabel: null,
        effectiveType: null,
        effectiveLabel: null,
        downlink: null,
        rtt: null,
        saveData: null,
        online: navigator.onLine
      };
    }
    return {
      supported: true,
      type: connection.type || null,
      typeLabel: networkTypeName(connection.type),
      effectiveType: connection.effectiveType || null,
      effectiveLabel: effectiveTypeName(connection.effectiveType),
      downlink: typeof connection.downlink === "number" ? connection.downlink : null,
      rtt: typeof connection.rtt === "number" ? connection.rtt : null,
      saveData: typeof connection.saveData === "boolean" ? connection.saveData : null,
      online: navigator.onLine
    };
  }

  function collectDisplay() {
    const screenInfo = window.screen || {};
    const viewport = window.visualViewport || null;
    const orientation = safe(() => screen.orientation.type, null);
    const gpu = collectWebgl();

    return {
      screenWidth: screenInfo.width || null,
      screenHeight: screenInfo.height || null,
      availWidth: screenInfo.availWidth || null,
      availHeight: screenInfo.availHeight || null,
      viewportWidth: window.innerWidth || null,
      viewportHeight: window.innerHeight || null,
      visualViewportWidth: viewport ? Math.round(viewport.width) : null,
      visualViewportHeight: viewport ? Math.round(viewport.height) : null,
      devicePixelRatio: window.devicePixelRatio || 1,
      colorDepth: screenInfo.colorDepth || null,
      pixelDepth: screenInfo.pixelDepth || null,
      orientation: orientation || null,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      coarsePointer: safe(() => window.matchMedia("(pointer: coarse)").matches, false),
      finePointer: safe(() => window.matchMedia("(pointer: fine)").matches, false),
      hover: safe(() => window.matchMedia("(hover: hover)").matches, false),
      colorGamut: safe(() => (window.matchMedia("(color-gamut: rec2020)").matches ? "rec2020" : window.matchMedia("(color-gamut: p3)").matches ? "Display P3" : "sRGB"), "Unknown"),
      dynamicRange: safe(() => (window.matchMedia("(dynamic-range: high)").matches ? "High" : "Standard"), "Unknown"),
      displayMode: safe(() => (window.matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser"), "unknown"),
      webgl: gpu
    };
  }

  function collectLocale() {
    const now = new Date();
    const resolved = safe(() => Intl.DateTimeFormat().resolvedOptions(), {});
    const offset = now.getTimezoneOffset();
    const parts = timezoneParts(now);
    return {
      language: navigator.language || null,
      languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 8) : [],
      timezone: resolved.timeZone || null,
      timezoneShort: parts || null,
      offsetMinutes: offset,
      offsetLabel: formatOffset(offset),
      locale: resolved.locale || navigator.language || null,
      calendar: resolved.calendar || null,
      numberingSystem: resolved.numberingSystem || null,
      hourCycle: resolved.hourCycle || null,
      localTime: localTimeString(now),
      localDateTime: dateTimeString(now),
      localDay: DAY_NAMES[now.getDay()],
      localMonth: MONTH_NAMES[now.getMonth()]
    };
  }

  function detectProtocol() {
    if (location.protocol === "file:") return "file:// (local preview)";
    return location.protocol.replace(":", "").toUpperCase();
  }

  async function lookupIp() {
    const log = [];
    const startedAt = new Date().toISOString();

    if (!navigator.onLine) {
      log.push({
        provider: "—",
        host: "—",
        url: "—",
        outcome: "skipped",
        at: startedAt,
        ms: 0,
        note: "Browser reported offline; no IP lookup attempted."
      });
      return {
        ok: false,
        data: null,
        log,
        requestCount: 0,
        provider: null,
        error: "Offline"
      };
    }

    const providers = [
      {
        name: "ipwho.is",
        url: "https://ipwho.is/",
        normalize: (payload) => {
          if (!payload || payload.success === false) throw new Error(payload?.message || "Lookup failed");
          return {
            ip: payload.ip || null,
            city: payload.city || null,
            region: payload.region || null,
            country: payload.country || null,
            countryCode: payload.country_code || null,
            continent: payload.continent || null,
            latitude: typeof payload.latitude === "number" ? payload.latitude : null,
            longitude: typeof payload.longitude === "number" ? payload.longitude : null,
            isp: payload.connection?.isp || null,
            org: payload.connection?.org || null,
            asn: payload.connection?.asn || null,
            domain: payload.connection?.domain || null,
            timezone: payload.timezone?.id || null
          };
        }
      },
      {
        name: "ipapi.co",
        url: "https://ipapi.co/json/",
        normalize: (payload) => {
          if (!payload || payload.error) throw new Error(payload?.reason || "Lookup failed");
          return {
            ip: payload.ip || null,
            city: payload.city || null,
            region: payload.region || null,
            country: payload.country_name || null,
            countryCode: payload.country_code || null,
            continent: payload.continent_code || null,
            latitude: typeof payload.latitude === "number" ? payload.latitude : null,
            longitude: typeof payload.longitude === "number" ? payload.longitude : null,
            isp: payload.org || null,
            org: payload.org || null,
            asn: payload.asn || null,
            domain: null,
            timezone: payload.timezone || null
          };
        }
      }
    ];

    for (const provider of providers) {
      const started = performance.now();
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 6500);
      try {
        const response = await fetch(provider.url, {
          mode: "cors",
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          headers: { Accept: "application/json" },
          signal: controller.signal
        });
        window.clearTimeout(timeoutId);
        const elapsed = Math.round(performance.now() - started);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const data = provider.normalize(payload);
        log.push({
          provider: provider.name,
          host: new URL(provider.url).hostname,
          url: provider.url,
          outcome: "success",
          at: new Date().toISOString(),
          ms: elapsed,
          note: "Returned approximate IP metadata. No scan values were sent."
        });
        return {
          ok: true,
          data,
          log,
          requestCount: log.length,
          provider: provider.name,
          error: null
        };
      } catch (error) {
        window.clearTimeout(timeoutId);
        const elapsed = Math.round(performance.now() - started);
        log.push({
          provider: provider.name,
          host: new URL(provider.url).hostname,
          url: provider.url,
          outcome: controller.signal.aborted ? "timeout" : "failed",
          at: new Date().toISOString(),
          ms: elapsed,
          note: controller.signal.aborted ? "Request timed out after 6.5 seconds." : "CORS, network or provider error. No scan values were sent."
        });
      }
    }

    return {
      ok: false,
      data: null,
      log,
      requestCount: log.length,
      provider: null,
      error: "Lookup unavailable"
    };
  }

  function buildSignals(snapshot) {
    const signals = [];
    const add = (category, id, label, value, source, reach, observed, detail) => {
      if (value === null || value === undefined || value === "") return;
      signals.push({
        category,
        id,
        label,
        value: String(value),
        source: source || "Browser API",
        reach: reach || "visible",
        observed: observed !== false,
        detail: detail || ""
      });
    };

    const network = snapshot.network;
    const geo = snapshot.ip;
    const device = snapshot.device;
    const display = snapshot.display;
    const locale = snapshot.locale;
    const capabilities = snapshot.capabilities;
    const battery = snapshot.battery;
    const fingerprint = snapshot.fingerprint;

    add("network", "ip", "IP address", geo?.ip || "Not available", "IP lookup", geo?.ip ? "visible" : "hidden", Boolean(geo?.ip), "The address a server receives to return this page.");
    add("network", "isp", "Provider / ISP", geo?.isp || shortenIsp(geo?.org) || "Not available", "IP lookup", geo?.isp ? "visible" : "hidden", Boolean(geo?.isp), "Network operator associated with the connecting IP.");
    add("network", "asn", "Autonomous system", geo?.asn ? `AS${String(geo.asn).replace(/^AS/i, "")}` : "Not available", "IP lookup", geo?.asn ? "visible" : "hidden", Boolean(geo?.asn), "Routing network identifier.");
    add("network", "connection", "Connection type", network.typeLabel || network.effectiveLabel || (network.online ? "Type hidden by browser" : "Offline"), "Navigator.connection", network.typeLabel ? "visible" : network.effectiveType ? "partial" : "hidden", Boolean(network.typeLabel || network.effectiveLabel), "A website can see the network class, not your Wi-Fi name.");
    add("network", "downlink", "Downlink estimate", formatMegabits(network.downlink) || "Not exposed", "Navigator.connection", network.downlink !== null ? "partial" : "hidden", network.downlink !== null, "Browser-estimated bandwidth, not a live speed test.");
    add("network", "rtt", "Round-trip estimate", network.rtt !== null ? `${network.rtt} ms` : "Not exposed", "Navigator.connection", network.rtt !== null ? "partial" : "hidden", network.rtt !== null, "Estimated latency from the browser's connection hint.");
    add("network", "ssid", "Wi-Fi SSID", "Hidden by the browser", "Web platform", "hidden", false, "Not available to a website. The operating system keeps it private.");
    add("network", "save", "Save-Data", network.saveData === null ? "Not exposed" : network.saveData ? "On" : "Off", "Navigator.connection", network.saveData === null ? "hidden" : "partial", network.saveData !== null, "An optional data-saving preference hint.");

    if (geo) {
      const place = [geo.city, geo.region, geo.country].filter(Boolean).join(", ");
      add("location", "place", "Approximate place", place || "Not available", "IP lookup", "visible", Boolean(place), "City-level estimate from the IP, not GPS.");
      add("location", "coordinates", "Coordinates", geo.latitude !== null && geo.longitude !== null ? `${geo.latitude.toFixed(3)}, ${geo.longitude.toFixed(3)}` : "Not available", "IP lookup", "visible", geo.latitude !== null, "Approximate network coordinates, usually a city or ISP exchange.");
      add("location", "country", "Country", geo.country || "Not available", "IP lookup", "visible", Boolean(geo.country), "Country inferred from IP routing.");
      add("location", "ip-tz", "IP time zone", geo.timezone || "Not available", "IP lookup", "visible", Boolean(geo.timezone), "Time zone associated with the IP address.");
      if (geo.timezone && locale.timezone) {
        const aligned = geo.timezone === locale.timezone;
        add("location", "tz-match", "Time zone match", aligned ? "Aligned with browser" : `Mismatch: ${locale.timezone}`, "Browser + IP", "visible", true, "A mismatch can suggest a VPN, proxy or travel.");
      }
    } else {
      add("location", "place", "Approximate place", "Lookup unavailable", "IP lookup", "hidden", false, "The optional IP geolocation request did not return data.");
    }

    add("location", "tz", "Browser time zone", locale.timezone || "Unknown", "Intl.DateTimeFormat", "visible", Boolean(locale.timezone), "Read instantly from the browser's locale configuration.");
    add("location", "offset", "UTC offset", locale.offsetLabel || "Unknown", "Date", "visible", Boolean(locale.offsetLabel), "Used to infer local time and coarse longitude.");

    add("device", "os", "Operating system", device.osLabel, "User agent / Client Hints", "visible", Boolean(device.osName && device.osName !== "Unknown OS"), "The platform family shared in the request.");
    add("device", "browser", "Browser", device.browserLabel, "User agent / Client Hints", "visible", true, "Brand and version inferred from the user agent.");
    add("device", "engine", "Rendering engine", device.engine, "User agent", "visible", Boolean(device.engine && device.engine !== "Unknown engine"), "The browser engine family.");
    add("device", "form", "Device form", device.deviceType, "Platform + input", "visible", true, "Inferred from mobile hints and pointer type; not a hardware inventory.");
    add("device", "arch", "Architecture", device.architecture || "Not exposed", "UA Client Hints", device.architecture ? "partial" : "hidden", Boolean(device.architecture), "High-entropy hint available in some Chromium browsers.");
    add("device", "cpu", "CPU threads", device.hardwareConcurrency ? String(device.hardwareConcurrency) : "Not exposed", "Navigator.hardwareConcurrency", device.hardwareConcurrency ? "visible" : "hidden", Boolean(device.hardwareConcurrency), "Logical processor count, rounded by some browsers.");
    add("device", "memory", "Device memory", device.deviceMemory ? `${device.deviceMemory} GB (approx.)` : "Not exposed", "Navigator.deviceMemory", device.deviceMemory ? "visible" : "hidden", Boolean(device.deviceMemory), "A coarse memory hint, not the amount in use.");
    add("device", "gpu", "GPU renderer", display.webgl.renderer || display.webgl.vendor || "Not exposed", "WebGL", "visible", Boolean(display.webgl.renderer), "The graphics stack used to render the page.");
    if (snapshot.webgpu?.supported && snapshot.webgpu.adapter) {
      const gpuInfo = [snapshot.webgpu.adapter.vendor, snapshot.webgpu.adapter.architecture, snapshot.webgpu.adapter.device].filter(Boolean).join(" / ");
      add("device", "webgpu", "WebGPU adapter", gpuInfo || "Available (details withheld)", "WebGPU", "visible", true, "Modern graphics API capability signal.");
    }
    add("device", "model", "Device model", device.model || "Not exposed", "UA Client Hints", device.model ? "partial" : "hidden", Boolean(device.model), "Usually available only on Android and some Chromium builds.");

    const screenSize = display.screenWidth && display.screenHeight ? `${display.screenWidth} × ${display.screenHeight}` : "Unknown";
    const viewportSize = `${display.viewportWidth} × ${display.viewportHeight}`;
    add("display", "screen", "Screen size", screenSize, "Screen API", "visible", Boolean(display.screenWidth), "CSS pixels; not necessarily physical pixels.");
    add("display", "viewport", "Viewport", viewportSize, "Window", "visible", true, "The visible browser area when the page loaded.");
    add("display", "dpr", "Pixel ratio", `${Number(display.devicePixelRatio.toFixed(2))}×`, "Window.devicePixelRatio", "visible", true, "How many physical pixels represent one CSS pixel.");
    add("display", "color", "Colour", `${display.colorDepth}-bit · ${display.colorGamut}`, "Screen + media query", "visible", Boolean(display.colorDepth), "Colour depth and gamut support.");
    add("display", "touch", "Input", display.maxTouchPoints > 0 ? `${display.maxTouchPoints} touch points` : "Mouse / trackpad", "Pointer + touch APIs", "visible", true, "The page can respond differently to touch and pointer types.");
    add("display", "mode", "Display mode", display.displayMode, "Media query", "visible", true, "Browser tab, standalone app or full-screen mode.");
    add("display", "motion", "Motion preference", snapshot.preferences.reducedMotion ? "Reduced motion" : "Standard motion", "Media query", "visible", true, "Accessibility preference exposed to every page.");
    add("display", "contrast", "Contrast preference", snapshot.preferences.contrast, "Media query", "visible", true, "More contrast, less contrast, or no preference.");

    add("language", "language", "Primary language", locale.language || "Unknown", "Navigator.language", "visible", Boolean(locale.language), "The preferred language sent in the request.");
    add("language", "languages", "Language list", locale.languages.join(" → ") || "Unknown", "Navigator.languages", "visible", locale.languages.length > 0, "The ordered fallback list can add context.");
    add("language", "timezone", "Resolved timezone", locale.timezone || "Unknown", "Intl.DateTimeFormat", "visible", Boolean(locale.timezone), "Time zone derived from the operating system.");
    add("language", "offset", "UTC offset", locale.offsetLabel || "Unknown", "Date", "visible", Boolean(locale.offsetLabel), "Current offset, including daylight saving where present.");
    add("language", "calendar", "Calendar / numbers", `${locale.calendar || "unknown"} / ${locale.numberingSystem || "unknown"}`, "Intl", "visible", Boolean(locale.calendar), "Locale conventions can be part of a fingerprint.");

    add("fingerprint", "canvas", "Canvas signature", fingerprint.canvas.hash || "Not supported", "Canvas 2D", fingerprint.canvas.supported ? "visible" : "hidden", fingerprint.canvas.supported, "A 360 × 100 render reduced to a local component hash.");
    add("fingerprint", "webgl", "WebGL signature", fingerprint.webgl.hash || "Not supported", "WebGL", fingerprint.webgl.supported ? "visible" : "hidden", fingerprint.webgl.supported, "GPU rendering details reduced to a local component hash.");
    add("fingerprint", "audio", "Audio signature", fingerprint.audio.hash || "Not supported", "OfflineAudioContext", fingerprint.audio.supported ? "visible" : "hidden", fingerprint.audio.supported, "A synthetic audio render; no microphone access.");
    add("fingerprint", "fonts", "Common fonts", fingerprint.fonts.matched.length ? `${fingerprint.fonts.matched.length} matched` : "None matched", "Font measurement", fingerprint.fonts.supported ? "visible" : "hidden", fingerprint.fonts.supported && fingerprint.fonts.matched.length > 0, fingerprint.fonts.matched.join(", "));
    add("fingerprint", "hash", "Combined signature", fingerprint.hash || "Computing…", "Local SHA-256", fingerprint.hash ? "visible" : "hidden", Boolean(fingerprint.hash), "A local hash of selected stable values; not transmitted.");
    add("fingerprint", "replay", "Replay check", fingerprint.replay || "Pending", "Canvas replay", "visible", Boolean(fingerprint.replay), "Two same-session canvas renders compared locally.");

    add("battery", "level", "Battery level", battery.supported && battery.level !== null ? `${battery.level}%` : "Not exposed", "Battery Status API", battery.supported && battery.level !== null ? "partial" : "hidden", Boolean(battery.supported && battery.level !== null), "Only exposed in some browsers; often unavailable on privacy-hardened builds.");
    add("battery", "charging", "Charging state", battery.supported && battery.charging !== null ? (battery.charging ? "Charging" : "On battery") : "Not exposed", "Battery Status API", battery.supported && battery.charging !== null ? "partial" : "hidden", Boolean(battery.supported && battery.charging !== null), "Power state can contribute to a visit fingerprint.");
    add("battery", "api", "Battery API", battery.supported ? "Available" : "Not available in this browser", "Feature detection", battery.supported ? "partial" : "hidden", true, "Availability differs across Chromium, Firefox, Safari and privacy tools.");

    add("surface", "cookies", "First-party storage", capabilities.cookiesEnabled ? "Enabled" : "Blocked", "Navigator.cookieEnabled", "visible", true, "This page sets no cookies. The flag only reports browser capability.");
    add("surface", "dnt", "Do Not Track signal", capabilities.doNotTrack === null ? "Not sent" : capabilities.doNotTrack === "1" ? "Enabled" : "Sent", "Navigator.doNotTrack", capabilities.doNotTrack === null ? "hidden" : "visible", capabilities.doNotTrack !== null, "A voluntary signal; many sites ignore it.");
    add("surface", "gpc", "Global Privacy Control", capabilities.gpc === true ? "Enabled" : "Not detected", "Navigator.globalPrivacyControl", capabilities.gpc === true ? "visible" : "hidden", capabilities.gpc === true, "An opt-out signal with legal weight in some jurisdictions.");
    add("surface", "transport", "Page transport", capabilities.transport, "Location", "visible", true, "Whether the page is served over HTTPS, local file or another protocol.");
    add("surface", "secure", "Secure context", capabilities.secureContext ? "Yes" : "No", "Window.isSecureContext", "visible", true, "Some powerful APIs are unavailable outside a secure context.");
    add("surface", "permissions", "Permission statuses", capabilities.permissions.supported ? `${capabilities.permissions.queryable} queryable · ${capabilities.permissions.granted} granted · ${capabilities.permissions.denied} denied` : "Permissions API unavailable", "Permissions API", capabilities.permissions.supported ? "partial" : "hidden", capabilities.permissions.supported, "Status only. No permission was requested.");
    add("surface", "storage", "Storage quota", capabilities.storage.supported ? `${capabilities.storage.quotaLabel || "Unknown"} quota${capabilities.storage.usagePercent !== null ? ` · ${capabilities.storage.usagePercent.toFixed(1)}% used` : ""}` : "Not exposed", "StorageManager.estimate", capabilities.storage.supported ? "partial" : "hidden", capabilities.storage.supported, "An estimate of available storage, sometimes rounded heavily.");
    add("surface", "media", "Media device count", capabilities.mediaDevices.supported ? mediaSummary(capabilities.mediaDevices) : "Not exposed", "enumerateDevices", capabilities.mediaDevices.supported ? "partial" : "hidden", capabilities.mediaDevices.supported, "Counts only; no microphone or camera access. Labels were not stored.");
    add("surface", "pdf", "PDF viewer", capabilities.pdfViewerEnabled ? "Built in" : "Not exposed", "Navigator.pdfViewerEnabled", capabilities.pdfViewerEnabled !== null ? "visible" : "hidden", capabilities.pdfViewerEnabled !== null, "A small but useful browser capability signal.");
    add("surface", "isolated", "Cross-origin isolated", capabilities.crossOriginIsolated ? "Yes" : "No", "Window.crossOriginIsolated", "visible", true, "Indicates which powerful APIs the page can access.");

    return signals;
  }

  function mediaSummary(media) {
    if (!media.supported) return "Not exposed";
    if (!media.total) return "None exposed";
    const parts = [];
    if (media.counts.audioinput) parts.push(`${media.counts.audioinput} audio in`);
    if (media.counts.videoinput) parts.push(`${media.counts.videoinput} video in`);
    if (media.counts.audiooutput) parts.push(`${media.counts.audiooutput} audio out`);
    return parts.join(" · ") || `${media.total} devices`;
  }

  async function collect(onStep) {
    const step = typeof onStep === "function" ? onStep : () => {};
    const started = performance.now();
    const startedAt = new Date().toISOString();

    step(0, "Reading the request layer");
    const browser = detectBrowser();
    const deviceType = getDeviceType(browser.osKey);
    const formFactor = getFormFactor(browser.osKey);
    const display = collectDisplay();
    const locale = collectLocale();

    step(1, "Mapping the device");
    const uaData = await getHighEntropy();
    const connection = collectConnection();

    const [permissionResult, mediaDevices, storage, battery, webgpu, audio, ipResult] = await Promise.all([
      collectPermissions(),
      collectMediaDevices(),
      collectStorageEstimate(),
      collectBattery(),
      collectWebgpu(),
      renderAudioSample(),
      lookupIp()
    ]);

    step(4, "Assembling the fingerprint");

    const canvasA = renderCanvasSample();
    const canvasB = renderCanvasSample();
    const fonts = probeFonts();
    const webgl = display.webgl;

    const architecture = uaData?.architecture || null;
    const bitness = uaData?.bitness || null;
    const model = uaData?.model || null;
    const platformVersion = uaData?.platformVersion || null;
    const uaFullVersion = uaData?.uaFullVersion || null;

    const browserLabel = browser.version
      ? `${browser.name} ${browser.version.split(".").slice(0, 2).join(".")}`
      : browser.name;

    const fingerprintParts = {
      canvas: canvasA?.hash || canvasB?.hash || null,
      webgl: webgl.hash || null,
      audio: audio.hash || null,
      fonts: fonts.hash || null,
      hardware: cyrb53([
        navigator.hardwareConcurrency || "",
        navigator.deviceMemory || "",
        navigator.maxTouchPoints || 0,
        webgl.vendor || "",
        webgl.renderer || "",
        architecture || "",
        bitness || ""
      ].join("|")),
      locale: cyrb53([
        locale.language || "",
        locale.languages.join(","),
        locale.timezone || "",
        locale.offsetMinutes,
        locale.calendar || "",
        locale.numberingSystem || ""
      ].join("|"))
    };

    const fingerprint = {
      canvas: {
        supported: Boolean(canvasA || canvasB),
        hash: canvasA?.hash || canvasB?.hash || null,
        width: canvasA?.width || 360,
        height: canvasA?.height || 100
      },
      webgl: {
        supported: webgl.supported,
        hash: webgl.hash,
        vendor: webgl.vendor,
        renderer: webgl.renderer,
        version: webgl.version,
        maxTextureSize: webgl.maxTextureSize,
        maxViewport: webgl.maxViewport
      },
      audio,
      fonts,
      parts: fingerprintParts,
      replay: canvasA && canvasB ? (canvasA.hash === canvasB.hash ? "stable in this session" : "changed between renders") : "not testable",
      hash: null,
      components: []
    };

    step(5, "Locating the network");

    const geo = ipResult.data;
    const ipCountry = geo?.country || null;
    const timezoneAlign = geo?.timezone && locale.timezone ? geo.timezone === locale.timezone : null;

    const network = {
      ...connection,
      ip: geo?.ip || null,
      city: geo?.city || null,
      region: geo?.region || null,
      country: ipCountry,
      countryCode: geo?.countryCode || null,
      continent: geo?.continent || null,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      isp: geo?.isp || null,
      org: geo?.org || null,
      asn: geo?.asn || null,
      ipTimezone: geo?.timezone || null,
      timezoneAlign,
      typeName: connection.typeLabel,
      effectiveName: connection.effectiveLabel,
      lookupProvider: ipResult.provider,
      lookupOk: ipResult.ok,
      lookupError: ipResult.error,
      online: navigator.onLine
    };

    const typeDisplay = connection.typeLabel || connection.effectiveLabel || (navigator.onLine ? "Network type hidden" : "Offline");
    const providerDisplay = shortenIsp(geo?.isp || geo?.org) || null;
    const networkDisplay = providerDisplay ? `${typeDisplay} · ${providerDisplay}` : typeDisplay;

    const coordinates = geo?.latitude !== null && geo?.longitude !== null && geo?.latitude !== undefined
      ? { latitude: geo.latitude, longitude: geo.longitude }
      : null;

    const mapPosition = coordinates ? {
      x: clamp(((coordinates.longitude + 180) / 360) * 100, 2, 98),
      y: clamp(((84 - coordinates.latitude) / (84 + 58)) * 100, 4, 96)
    } : null;

    const capabilities = {
      cookiesEnabled: Boolean(navigator.cookieEnabled),
      doNotTrack: navigator.doNotTrack === undefined ? null : navigator.doNotTrack,
      gpc: navigator.globalPrivacyControl === true,
      pdfViewerEnabled: typeof navigator.pdfViewerEnabled === "boolean" ? navigator.pdfViewerEnabled : null,
      webdriver: Boolean(navigator.webdriver),
      crossOriginIsolated: Boolean(window.crossOriginIsolated),
      secureContext: Boolean(window.isSecureContext),
      transport: detectProtocol(),
      storage,
      mediaDevices,
      permissions: permissionResult
    };

    const device = {
      browserName: browser.name,
      browserVersion: browser.version,
      browserLabel,
      engine: browser.engine,
      osName: browser.osName,
      osVersion: browser.osVersion,
      osLabel: browser.osLabel,
      osKey: browser.osKey,
      deviceType,
      formFactor,
      platform: navigator.platform || "Unknown",
      userAgent: navigator.userAgent,
      vendor: navigator.vendor || null,
      mobileHint: Boolean(navigator.userAgentData?.mobile),
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemory: navigator.deviceMemory || null,
      maxTouchPoints: navigator.maxTouchPoints || 0,
      architecture,
      bitness,
      model,
      platformVersion,
      uaFullVersion,
      uaBrands: navigator.userAgentData?.brands || [],
      fullVersionList: uaData?.fullVersionList || [],
      wow64: uaData?.wow64 ?? null
    };

    const preferences = {
      reducedMotion: safe(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, false),
      contrast: safe(() => {
        if (window.matchMedia("(prefers-contrast: more)").matches) return "More";
        if (window.matchMedia("(prefers-contrast: less)").matches) return "Less";
        return "No preference";
      }, "Unknown"),
      theme: safe(() => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "Dark" : "Light"), "Unknown")
    };

    const snapshot = {
      version: 1,
      startedAt,
      finishedAt: null,
      durationMs: null,
      userAgent: navigator.userAgent,
      network,
      ip: geo,
      networkDisplay,
      typeDisplay,
      providerDisplay,
      coordinates,
      mapPosition,
      locationText: [geo?.city, geo?.region, geo?.country].filter(Boolean).join(", ") || "Unavailable",
      device,
      display,
      locale,
      preferences,
      fingerprint,
      battery,
      capabilities,
      webgpu,
      requestLog: ipResult.log,
      requestCount: ipResult.requestCount,
      timezoneAlign,
      signals: [],
      meta: {
        provider: ipResult.provider,
        scanStartedAt: startedAt,
        externalRequests: ipResult.requestCount,
        permissionPrompts: 0
      }
    };

    snapshot.fingerprint = await window.WTSFingerprint.compute(snapshot);
    step(6, "Building the dossier");
    snapshot.signals = buildSignals(snapshot);
    snapshot.finishedAt = new Date().toISOString();
    snapshot.durationMs = Math.round(performance.now() - started);

    return snapshot;
  }

  window.WTSCollectors = {
    collect,
    detectBrowser,
    formatBytes,
    cyrb53
  };
})();
