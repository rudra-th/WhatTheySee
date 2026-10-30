# WhatTheySee

**A passive browser privacy mirror.** You see a website. It sees a signature.

**Live:** <https://whattheysee.surge.sh/>

WhatTheySee is a static, no-build site that reads the device, display, network and fingerprint signals a normal page can collect without a permission prompt, then turns them into an honest exposure score and a short list of fixes.

## What it does

- Runs a passive scan automatically on load. There is no scan button and no consent wall.
- Shows real values where the browser exposes them: viewport, pixel ratio, GPU renderer, CPU cores, memory hints, battery state, language, time zone, reduced-motion preference, connection type and more.
- Makes **one IP lookup**, with a single automatic fallback if the primary provider fails, to show the approximate network location any server would already see.
- Labels every value by reach: `visible`, `partly readable`, `inferred` or `hidden`. OS-only and illustrative values are called out in the interface.
- Computes a local SHA-256 fingerprint in the tab. The hash is never transmitted.
- Offers six practical fixes and a projected score drop. The checklist is saved only on your device.
- Includes a raw ledger, JSON export, method receipt and a source list.

## Privacy model

| Concern | Behaviour |
| --- | --- |
| Backend | None. The site is plain HTML, CSS and JS. |
| Analytics / ads | None. |
| Cookies | None set by this site. |
| Fonts / CDNs / maps | Self-hosted. No remote assets. |
| Outbound requests | One IP lookup: `ipwho.is`, with `ipapi.co` as fallback only if the first fails. At most two requests. |
| Permissions | None requested. Permission *status* may be queried; camera, microphone, location and clipboard are never invoked. |
| Local storage | `wts-theme` and `wts-fixes` only. Scan values stay in memory and disappear when the tab closes. |
| Fingerprint | Computed locally with SHA-256. Never sent anywhere. |

The scan cannot see Wi-Fi SSIDs, installed apps, notification contents, files, precise GPS, or data behind the browser sandbox. The device reconstruction is explicitly illustrative: geometry is inferred, the interface is not a screenshot.

## Run locally

From the project root:

```bash
python -m http.server 8000
```

Open <http://localhost:8000/>. A local HTTP server is required because the browser blocks module-style/secure-context clipboard behaviour and some APIs on `file://`.

There is no install step, build step or package manager.

## Deploy

Everything needed is in the project root. Upload the whole folder (excluding `tools/`) to any static host.

- **Surge** — deploy a clean copy (without `tools/`) with `surge . whattheysee.surge.sh`. Surge ignores `_headers`, so the CSP and security headers are not applied there.
- **Netlify Drop** — drag the folder onto <https://app.netlify.com/drop>. `_headers` is applied automatically.
- **Cloudflare Pages** — create a project, choose "Direct Upload", and upload the folder. `_headers` is applied automatically.
- **GitHub Pages** — push the site files to a repository, then enable Pages for the branch root. GitHub Pages ignores `_headers`, so the CSP and security headers will not be applied unless you put a proxy/CDN in front.

`_headers` contains a strict CSP, `Referrer-Policy: no-referrer`, clickjacking protection and a restrictive `Permissions-Policy`. If you add a host or change the IP provider, update `connect-src` in that file.

## Project structure

```text
index.html                 Page shell, inline SVG icon sprite, dialogs
styles.css                 Design system, layouts, themes, responsive rules
js/theme-init.js           Pre-paint theme restore (avoids a flash)
js/data.js                 Copy, categories, fixes and score bands
js/collectors.js           Passive browser/network collection
js/fingerprint.js          Local SHA-256 signature
js/score.js                Exposure score and fix projection
js/app.js                  Rendering, scan lifecycle, device stages, UI behaviour
assets/fonts/              Self-hosted Space Grotesk + JetBrains Mono, OFL licences
assets/img/world-map.svg   Generated Natural Earth basemap
tools/build-map.py         Rebuilds the basemap from tools/data/ne_countries.geojson
tools/data/                Natural Earth source data (not deployed)
tools/shot.mjs             Headless-Chrome visual QA helper
favicon.svg                Site icon
_headers                   Static-host security headers
```

## Design and data notes

- Type: **Space Grotesk** by Florian Karsten and **JetBrains Mono** by JetBrains, both under the SIL Open Font License 1.1. Licence texts are in `assets/fonts/`.
- Basemap: **Natural Earth** 1:110m Admin 0 – Countries, public domain. The generated SVG is intentionally low-detail and carries no labels.
- IP geolocation: [ipwho.is](https://ipwho.is/) primary, [ipapi.co](https://ipapi.co/) fallback. Both are third-party services with their own privacy policies. The site sends no scan values to either; the request itself necessarily reveals your IP, as any web request does.
- Permissions API output is per-origin and browser-dependent. A `prompt` status means "not decided", not "granted".
- Battery, Network Information and Device Memory APIs vary by browser. Unsupported values are shown as unavailable rather than invented.
- The exposure score is a weighted completeness model, not a risk verdict or a comparison with other visitors. The fix projection is a deliberately simple model.

## Visual QA

`tools/shot.mjs` drives an existing headless Chrome session on port `9223` and writes screenshots to a temp folder. It covers desktop/mobile, dark/light, dialogs, reduced motion and the three device stages.

```bash
# Start Chrome once (Windows example)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --headless=new --disable-gpu --hide-scrollbars `
  --remote-debugging-port=9223 `
  --user-data-dir="$env:TEMP\wts-chrome-profile" about:blank

# With the local server running:
node tools/shot.mjs
$env:SHOT_MODE="mobile"; node tools/shot.mjs
$env:SHOT_THEME="light"; node tools/shot.mjs
```

Headless Chrome cancels file downloads in this environment even though it receives the full blob. The export path is therefore verified by the `Browser.downloadWillBegin` event and payload size, not by a saved file.

## Limitations

- IP location is approximate and can be wrong. VPNs, carrier NAT and shared egress make it less precise.
- A browser can change its fingerprint after updates, zoom changes, font installs or privacy tools. The replay check only compares two builds in the same session.
- The device illustration uses the detected OS to choose a desktop or phone chrome. It does not claim to reproduce the actual device.
- This is an educational demonstration, not a security audit, legal advice or a guarantee of anonymity.

---

Built as a static lab. No accounts, no server, no scan history.
