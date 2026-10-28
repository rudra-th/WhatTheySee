/* Local visual QA helper. Requires Chrome started with --remote-debugging-port=9223.
 *
 *   node tools/shot.mjs
 *   $env:SHOT_MODE="mobile"; node tools/shot.mjs
 *   $env:SHOT_THEME="light"; node tools/shot.mjs
 */
import { writeFile } from "node:fs/promises";

const PORT = 9223;
const BASE = "http://127.0.0.1:" + PORT;
const OUT = process.env.SHOT_DIR || "C:/Users/Asus/AppData/Local/Temp/opencode";
const URL_TO_TEST = process.env.SHOT_URL || "http://localhost:8000/";
const MODE = process.env.SHOT_MODE || "desktop";
const THEME = process.env.SHOT_THEME === "light" ? "light" : "dark";

const target = await fetch(BASE + "/json/new?" + encodeURIComponent(URL_TO_TEST), { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, timeout = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(250);
  }
  return false;
}

async function shot(name, fullPage = false) {
  const params = { format: "png", captureBeyondViewport: fullPage };
  if (fullPage) {
    const metrics = await send("Page.getLayoutMetrics");
    const size = metrics.cssContentSize;
    params.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
  }
  const result = await send("Page.captureScreenshot", params);
  const path = `${OUT}/${name}.png`;
  await writeFile(path, Buffer.from(result.data, "base64"));
  console.log(path);
}

async function scrollToSection(selector, offset = 76) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - ${offset}, behavior: "instant" });
    return true;
  })()`);
  await sleep(420);
}

async function scrollToEdgeProgress(progress) {
  await evaluate(`(() => {
    const el = document.querySelector(".edge-scroll");
    const header = document.querySelector(".site-header");
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const start = window.scrollY + rect.top - (header ? header.offsetHeight : 0);
    const travel = Math.max(1, el.offsetHeight - window.innerHeight);
    window.scrollTo({ top: start + travel * ${progress}, behavior: "instant" });
    return true;
  })()`);
  await sleep(900);
}

async function openDialog(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`);
  await sleep(500);
}

async function closeDialog() {
  await evaluate(`document.querySelector("dialog[open] [data-close-dialog]")?.click()`);
  await sleep(300);
}

await send("Page.enable");
await send("Runtime.enable");

const mobile = MODE === "mobile";
await send("Emulation.setDeviceMetricsOverride", {
  width: mobile ? 390 : 1440,
  height: mobile ? 844 : 1000,
  deviceScaleFactor: mobile ? 2 : 1,
  mobile
});
await send("Emulation.setEmulatedMedia", {
  features: [
    { name: "prefers-color-scheme", value: THEME },
    { name: "prefers-reduced-motion", value: "no-preference" }
  ]
});

await send("Page.navigate", { url: URL_TO_TEST });
await evaluate(`localStorage.setItem("wts-theme", ${JSON.stringify(THEME)})`).catch(() => {});
await send("Page.reload");
await waitFor(`document.readyState === "complete"`);
const finished = await waitFor(`document.getElementById("scanStatusText")?.textContent?.includes("Scan complete")`);
await evaluate(`document.fonts ? document.fonts.ready.then(() => true) : true`);
await sleep(1000);
console.log("scan finished:", finished);

const prefix = `${mobile ? "wts-m" : "wts"}-${THEME}`;
await shot(`${prefix}-hero`);

await scrollToSection("#scan");
await sleep(600);
await shot(`${prefix}-scan`);

if (mobile) {
  await scrollToSection("#device");
  await sleep(600);
  await shot(`${prefix}-device-surface`);
  await evaluate(`document.querySelector('[data-edge-step="1"]')?.click()`);
  await sleep(1100);
  await shot(`${prefix}-device-system`);
  await evaluate(`document.querySelector('[data-edge-step="2"]')?.click()`);
  await sleep(1100);
  await shot(`${prefix}-device-edge`);
} else {
  await scrollToEdgeProgress(0.1);
  await shot(`${prefix}-device-stage0`);
  await scrollToEdgeProgress(0.42);
  await shot(`${prefix}-device-stage1`);
  await scrollToEdgeProgress(0.8);
  await shot(`${prefix}-device-stage2`);
}

await scrollToSection("#permissions");
await shot(`${prefix}-permissions`);

await scrollToSection("#fingerprint");
await shot(`${prefix}-fingerprint`);

await scrollToSection("#dossier");
await shot(`${prefix}-dossier`);

await scrollToSection("#fix");
await shot(`${prefix}-fix`);

await scrollToSection("#evidence");
await shot(`${prefix}-evidence`);

await scrollToSection(".site-footer", 100);
await shot(`${prefix}-footer`);

await openDialog("#openLedger");
await shot(`${prefix}-ledger-dialog`);
await closeDialog();

await openDialog("#openMethodFooter");
await shot(`${prefix}-method-dialog`);
await closeDialog();

// Reduced-motion sweep: the device section has no pin and always resolves
// to the sandbox edge, so verify it lays out and remains legible.
await send("Emulation.setEmulatedMedia", {
  features: [
    { name: "prefers-color-scheme", value: THEME },
    { name: "prefers-reduced-motion", value: "reduce" }
  ]
});
await send("Page.reload");
await waitFor(`document.readyState === "complete"`);
await waitFor(`document.getElementById("scanStatusText")?.textContent?.includes("Scan complete")`);
await scrollToSection("#device");
await sleep(700);
await shot(`${prefix}-device-reduced`);
const reducedStage = await evaluate(`document.getElementById("edgePin")?.dataset.stage`);
console.log("reduced-motion edge stage:", reducedStage);

await evaluate(`localStorage.removeItem("wts-theme")`).catch(() => {});
ws.close();
await fetch(BASE + "/json/close/" + target.id).catch(() => {});
