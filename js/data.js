/* =========================================================
   WhatTheySee — static copy and configuration
   No build step. Plain browser globals.
   ========================================================= */

(function () {
  "use strict";

  const CATEGORIES = {
    network: {
      label: "Network",
      icon: "network",
      kicker: "01 / NETWORK",
      description: "The transport layer",
      tone: "blue"
    },
    location: {
      label: "Location",
      icon: "pin",
      kicker: "02 / LOCATION",
      description: "Approximate geography",
      tone: "mint"
    },
    device: {
      label: "Device",
      icon: "device",
      kicker: "03 / DEVICE",
      description: "The machine profile",
      tone: "violet"
    },
    display: {
      label: "Display",
      icon: "display",
      kicker: "04 / DISPLAY",
      description: "The window geometry",
      tone: "amber"
    },
    language: {
      label: "Language",
      icon: "globe",
      kicker: "05 / LANGUAGE",
      description: "Locale and local time",
      tone: "blue"
    },
    fingerprint: {
      label: "Fingerprint",
      icon: "fingerprint",
      kicker: "06 / FINGERPRINT",
      description: "Rendering signature",
      tone: "mint"
    },
    battery: {
      label: "Battery",
      icon: "battery",
      kicker: "07 / BATTERY",
      description: "Power state",
      tone: "amber"
    },
    surface: {
      label: "Browser surface",
      icon: "layers",
      kicker: "08 / SURFACE",
      description: "Capabilities and consent",
      tone: "rose"
    }
  };

  const CATEGORY_ORDER = [
    "network",
    "location",
    "device",
    "display",
    "language",
    "fingerprint",
    "battery",
    "surface"
  ];

  const SCORE_CATEGORIES = [
    { id: "network", label: "Network", weight: 15 },
    { id: "precision", label: "Precision", weight: 10 },
    { id: "device", label: "Device", weight: 15 },
    { id: "display", label: "Display", weight: 8 },
    { id: "locale", label: "Context", weight: 7 },
    { id: "fingerprint", label: "Fingerprint", weight: 25 },
    { id: "battery", label: "Battery", weight: 6 },
    { id: "surface", label: "Surface", weight: 14 }
  ];

  const BANDS = [
    {
      min: 0,
      max: 34,
      label: "Narrow surface",
      key: "narrow",
      copy: "A browser with meaningful limits. Less volunteered, but never invisible."
    },
    {
      min: 35,
      max: 59,
      label: "Limited surface",
      key: "limited",
      copy: "Some obvious channels are closed. Enough remains to make a comparison."
    },
    {
      min: 60,
      max: 74,
      label: "Elevated surface",
      key: "elevated",
      copy: "A recognisable silhouette. Most of the modern web can read this much."
    },
    {
      min: 75,
      max: 89,
      label: "Distinctive surface",
      key: "distinctive",
      copy: "A rich set of stable signals. Easy to compare across visits and sites."
    },
    {
      min: 90,
      max: 100,
      label: "Wide-open surface",
      key: "wide",
      copy: "Nearly every passive channel answered. The browser’s introduction was thorough."
    }
  ];

  const REACH = {
    visible: { label: "VISIBLE", className: "reach-visible", text: "Available without asking" },
    partial: { label: "PARTLY", className: "reach-partial", text: "Browser-dependent" },
    gated: { label: "GATED", className: "reach-gated", text: "Requires permission" },
    hidden: { label: "HIDDEN", className: "reach-hidden", text: "Not exposed to the page" }
  };

  const FIXES = [
    {
      id: "hardened-browser",
      index: "01",
      title: "Move to a browser that resists fingerprints",
      description: "Use strict tracking protection and fingerprint randomisation where it is available. Make the silhouette less repeatable, not just less visible.",
      impact: 11,
      impactLabel: "High",
      effort: "2 min",
      tag: "Fingerprint",
      steps: [
        "Firefox: open Settings → Privacy & Security, choose Strict and enable “Tell websites not to sell or share my data.”",
        "Safari: enable Advanced Tracking and Fingerprinting Protection in Settings → Safari.",
        "Brave: set Shields to Aggressive and leave fingerprint randomisation on.",
        "Expect some sites to break. A smaller surface can also mean a rougher experience."
      ]
    },
    {
      id: "vpn",
      index: "02",
      title: "Stop broadcasting your network address",
      description: "A trustworthy VPN or privacy relay changes the network-level signal a site sees first. It will not change your device fingerprint.",
      impact: 12,
      impactLabel: "High",
      effort: "5 min",
      tag: "Network",
      steps: [
        "Choose a provider with a clear no-logs policy, independent audits and a jurisdiction you understand.",
        "Turn on the VPN before browsing; a disconnected VPN reveals the real IP again.",
        "Use DNS-over-HTTPS or the provider’s protected DNS where offered.",
        "Remember: a VPN moves where you appear to be. It does not anonymise the browser itself."
      ]
    },
    {
      id: "cookies",
      index: "03",
      title: "Isolate third-party storage",
      description: "Block third-party cookies, clear what you do not need, and use containers or separate profiles for separate parts of your life.",
      impact: 8,
      impactLabel: "Medium",
      effort: "4 min",
      tag: "Identity",
      steps: [
        "Turn on the browser’s third-party cookie blocking and tracking-protection setting.",
        "Use Firefox Multi-Account Containers or separate profiles for shopping, social and work.",
        "Clear cookies for sites you no longer use; use temporary sessions when evaluating something new.",
        "This page itself sets no cookies. A site you log into can still recognise your account."
      ]
    },
    {
      id: "permissions",
      index: "04",
      title: "Revoke permissions you do not remember giving",
      description: "Audit camera, microphone, location, notifications and clipboard access. Permission is per site, and it can be withdrawn.",
      impact: 5,
      impactLabel: "Medium",
      effort: "3 min",
      tag: "Consent",
      steps: [
        "Open the site-information panel (the icon beside the address bar) and review every permission.",
        "Set anything you do not actively use to Block, not Ask.",
        "Review notifications separately; a dormant notification permission is still a future channel.",
        "This page never requested any of these permissions."
      ]
    },
    {
      id: "profiles",
      index: "05",
      title: "Separate the people you are",
      description: "Use different browser profiles for high-trust and high-exposure activity. Correlation is what turns a silhouette into a dossier.",
      impact: 7,
      impactLabel: "Medium",
      effort: "6 min",
      tag: "Correlation",
      steps: [
        "Create one profile for banking and identity-linked services.",
        "Create another for research, shopping and sites you do not trust yet.",
        "Do not sign into the same accounts across profiles.",
        "Profile separation is not invisibility. Your IP and device still connect the two."
      ]
    },
    {
      id: "surface",
      index: "06",
      title: "Reduce what can be measured",
      description: "Use the browser’s built-in protection before adding more extensions. Every extension can itself become a fingerprint.",
      impact: 6,
      impactLabel: "Medium",
      effort: "4 min",
      tag: "Surface",
      steps: [
        "Enable browser tracking protection and site isolation; keep the browser updated.",
        "Use a content blocker from a trusted publisher — one, not a stack.",
        "Turn off JavaScript where a trusted site does not need it.",
        "Do not install “anti-fingerprinting” tools blindly; inconsistent changes can make you more unique."
      ]
    }
  ];

  const FINGERPRINT_COMPONENT_META = {
    canvas: { label: "Canvas rendering", icon: "display", note: "Pixels drawn by your GPU, fonts and browser" },
    webgl: { label: "WebGL stack", icon: "cpu", note: "GPU vendor, renderer and rendering limits" },
    audio: { label: "Audio processing", icon: "network", note: "How your audio stack processes a synthetic signal" },
    fonts: { label: "Font probe", icon: "file", note: "Which common fonts your system can render" },
    hardware: { label: "Hardware shape", icon: "cpu", note: "CPU threads, memory hint and input model" },
    locale: { label: "Time + language", icon: "globe", note: "Locale, time zone and local clock" }
  };

  const FINGERPRINT_COMPONENT_ORDER = ["canvas", "webgl", "audio", "fonts", "hardware", "locale"];

  const METHODS = {
    primaryProvider: "ipwho.is",
    fallbackProvider: "ipapi.co"
  };

  window.WTS_DATA = {
    CATEGORIES,
    CATEGORY_ORDER,
    SCORE_CATEGORIES,
    BANDS,
    REACH,
    FIXES,
    FINGERPRINT_COMPONENT_META,
    FINGERPRINT_COMPONENT_ORDER,
    METHODS,
    SCAN_STEPS: [
      "Reading the request layer",
      "Mapping the device",
      "Measuring the window",
      "Probing the graphics stack",
      "Assembling the fingerprint",
      "Locating the network",
      "Building the dossier"
    ]
  };
})();
