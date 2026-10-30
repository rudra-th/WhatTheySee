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

  var theme = stored === "light" || stored === "dark" ? stored : "dark";

  root.setAttribute("data-theme", theme);

  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "light" ? "#f4f1ea" : "#09090a");
  }
})();
