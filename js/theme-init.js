(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var stored = null;
  try {
    stored = localStorage.getItem("wts-theme");
  } catch (error) {
    stored = null;
  }

  var prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  var theme = stored === "light" || stored === "dark" ? stored : prefersLight ? "light" : "dark";

  root.setAttribute("data-theme", theme);

  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "light" ? "#f3f6fb" : "#060b13");
  }
})();
