"""Build the equirectangular basemap from Natural Earth 1:110m data.

Source: Natural Earth Admin 0 - Countries (public domain).
https://www.naturalearthdata.com/downloads/110m-cultural-vectors/

The 838 KB GeoJSON source lives in tools/data and is not deployed. Only the
generated, simplified SVG is served.
"""
import json
import math

SRC = "tools/data/ne_countries.geojson"
OUT = "assets/img/world-map.svg"
W, H = 1000, 500
LAT_TOP, LAT_BOTTOM = 84, -58


def project(lon, lat):
    x = (lon + 180.0) / 360.0 * W
    y = (LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM) * H
    return x, y


def ring_path(ring):
    parts = []
    prev = None
    for lon, lat in ring:
        x, y = project(lon, lat)
        if prev is not None and abs(lon - prev) > 180:
            parts.append(f"M{x:.1f},{y:.1f}")
        elif not parts:
            parts.append(f"M{x:.1f},{y:.1f}")
        else:
            parts.append(f"L{x:.1f},{y:.1f}")
        prev = lon
    if parts:
        parts.append("Z")
    return "".join(parts)


with open(SRC, encoding="utf-8") as handle:
    geo = json.load(handle)

paths = []
for feature in geo["features"]:
    props = feature.get("properties", {})
    name = props.get("ADMIN") or props.get("NAME") or ""
    if name == "Antarctica":
        continue
    geometry = feature.get("geometry")
    if not geometry:
        continue
    kind = geometry["type"]
    coords = geometry["coordinates"]
    polygons = [coords] if kind == "Polygon" else coords
    d = ""
    for polygon in polygons:
        for ring in polygon:
            d += ring_path(ring)
    if d:
        paths.append(d)

joined = " ".join(paths)
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Stylised world map">
  <defs>
    <radialGradient id="glow" cx="50%" cy="42%" r="58%">
      <stop offset="0" stop-color="#1d3e58" stop-opacity=".38"/>
      <stop offset="1" stop-color="#07111e" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="7" height="7" patternUnits="userSpaceOnUse">
      <circle cx="1.2" cy="1.2" r=".8" fill="#78a0b8" opacity=".35"/>
    </pattern>
  </defs>
  <rect width="{W}" height="{H}" fill="#091523"/>
  <rect width="{W}" height="{H}" fill="url(#glow)"/>
  <g fill="url(#dots)" stroke="#3d6079" stroke-width=".7" stroke-opacity=".34" fill-rule="evenodd"><path d="{joined}"/></g>
  <g stroke="#4a7089" stroke-opacity=".12" stroke-width=".7">
    <path d="M0 83.3h1000M0 166.7h1000M0 250h1000M0 333.3h1000M0 416.7h1000"/>
    <path d="M125 0v500M250 0v500M375 0v500M500 0v500M625 0v500M750 0v500M875 0v500"/>
  </g>
</svg>
'''
with open(OUT, "w", encoding="utf-8", newline="\n") as handle:
    handle.write(svg)

print(f"Wrote {OUT}: {len(svg):,} bytes; {len(paths)} countries")
