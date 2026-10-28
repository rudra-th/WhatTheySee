/* =========================================================
   WhatTheySee — local signature assembly
   A SHA-256 of selected stable browser values. No upload.
   ========================================================= */

(function () {
  "use strict";

  const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotateRight(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  function sha256Sync(input) {
    const bytes = new TextEncoder().encode(input);
    const bitLength = bytes.length * 8;
    const paddedLength = (((bytes.length + 9 + 63) >> 6) << 6);
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;

    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
    view.setUint32(paddedLength - 4, bitLength >>> 0);

    const hash = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    const words = new Uint32Array(64);

    for (let offset = 0; offset < paddedLength; offset += 64) {
      for (let index = 0; index < 16; index += 1) {
        words[index] = view.getUint32(offset + index * 4);
      }

      for (let index = 16; index < 64; index += 1) {
        const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
        const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
        words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
      }

      let a = hash[0];
      let b = hash[1];
      let c = hash[2];
      let d = hash[3];
      let e = hash[4];
      let f = hash[5];
      let g = hash[6];
      let h = hash[7];

      for (let index = 0; index < 64; index += 1) {
        const S1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + SHA256_K[index] + words[index]) >>> 0;
        const S0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }

      hash[0] = (hash[0] + a) >>> 0;
      hash[1] = (hash[1] + b) >>> 0;
      hash[2] = (hash[2] + c) >>> 0;
      hash[3] = (hash[3] + d) >>> 0;
      hash[4] = (hash[4] + e) >>> 0;
      hash[5] = (hash[5] + f) >>> 0;
      hash[6] = (hash[6] + g) >>> 0;
      hash[7] = (hash[7] + h) >>> 0;
    }

    return Array.from(hash, (part) => part.toString(16).padStart(8, "0")).join("");
  }

  async function sha256(input) {
    if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === "function") {
      try {
        const bytes = new TextEncoder().encode(input);
        const digest = await window.crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      } catch (error) {
        return sha256Sync(input);
      }
    }
    return sha256Sync(input);
  }

  function component(meta, observed, value, hash, note) {
    return {
      key: meta.key,
      label: meta.label,
      icon: meta.icon,
      observed,
      value,
      hash: hash || null,
      note,
      shortHash: hash ? hash.slice(0, 12) : null
    };
  }

  async function compute(snapshot) {
    const fingerprint = snapshot.fingerprint;
    const device = snapshot.device;
    const display = snapshot.display;
    const locale = snapshot.locale;

    const canonical = [
      "wts:1",
      device.browserName,
      device.browserVersion,
      device.engine,
      device.osName,
      device.osVersion,
      device.architecture || "",
      device.bitness || "",
      device.hardwareConcurrency || "",
      device.deviceMemory || "",
      device.maxTouchPoints || 0,
      display.screenWidth,
      display.screenHeight,
      display.devicePixelRatio,
      display.colorDepth,
      display.colorGamut,
      locale.language,
      locale.languages.join(","),
      locale.timezone,
      locale.offsetMinutes,
      locale.calendar,
      locale.numberingSystem,
      fingerprint.parts.canvas || "",
      fingerprint.parts.webgl || "",
      fingerprint.parts.audio || "",
      fingerprint.parts.fonts || "",
      fingerprint.parts.hardware || "",
      fingerprint.parts.locale || ""
    ].join("|");

    const hash = await sha256(canonical);
    const fontCount = fingerprint.fonts.matched.length;
    const webglRenderer = fingerprint.webgl.renderer || fingerprint.webgl.vendor || "Not exposed";
    const meta = window.WTS_DATA.FINGERPRINT_COMPONENT_META;

    const components = [
      component(
        { key: "canvas", ...meta.canvas },
        fingerprint.canvas.supported,
        fingerprint.canvas.supported ? `Canvas ${fingerprint.canvas.width}×${fingerprint.canvas.height}` : "Not available",
        fingerprint.canvas.hash,
        fingerprint.canvas.supported ? "A local hash of rendered pixels" : snapshot.fingerprint.canvas.supported ? "Rendered but not hashable" : "Canvas blocked or unavailable"
      ),
      component(
        { key: "webgl", ...meta.webgl },
        fingerprint.webgl.supported,
        webglRenderer,
        fingerprint.webgl.hash,
        fingerprint.webgl.supported ? (fingerprint.webgl.maxTextureSize ? `Max texture ${fingerprint.webgl.maxTextureSize}px` : "GPU stack responded") : "WebGL blocked or unavailable"
      ),
      component(
        { key: "audio", ...meta.audio },
        fingerprint.audio.supported,
        fingerprint.audio.supported ? "Audio graph rendered" : "Not available",
        fingerprint.audio.hash,
        fingerprint.audio.supported ? `${fingerprint.audio.sampleCount} samples reduced to a local hash` : "Offline audio rendering was blocked or unsupported"
      ),
      component(
        { key: "fonts", ...meta.fonts },
        fingerprint.fonts.supported,
        fontCount ? `${fontCount} common fonts matched` : "No common fonts matched",
        fingerprint.fonts.hash,
        fontCount ? fingerprint.fonts.matched.slice(0, 6).join(", ") : "Measurement produced no matches"
      ),
      component(
        { key: "hardware", ...meta.hardware },
        Boolean(device.hardwareConcurrency || device.deviceMemory || fingerprint.webgl.renderer),
        [device.hardwareConcurrency ? `${device.hardwareConcurrency} threads` : null, device.deviceMemory ? `${device.deviceMemory} GB` : null, `${device.maxTouchPoints || 0} touch points`].filter(Boolean).join(" · "),
        fingerprint.parts.hardware,
        "Hardware shape + graphics stack"
      ),
      component(
        { key: "locale", ...meta.locale },
        Boolean(locale.language && locale.timezone),
        [locale.language, locale.timezone].filter(Boolean).join(" · "),
        fingerprint.parts.locale,
        "Locale + time zone + calendar"
      )
    ];

    return {
      ...fingerprint,
      hash,
      canonicalLength: canonical.length,
      components,
      observedComponents: components.filter((item) => item.observed).length,
      algorithm: "SHA-256"
    };
  }

  window.WTSFingerprint = {
    compute,
    sha256,
    sha256Sync
  };
})();
