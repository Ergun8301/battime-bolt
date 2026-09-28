# BEMEXO compositor

This is a small, deterministic frame renderer that works like Remotion. It uses only free, local tools:
Node 22, `playwright-core` driving the preinstalled Chromium, and the static ffmpeg in `../pyff`.
It has no cloud service, no paid API and no Remotion.

```
compositor/
  render.js            CLI renderer (Playwright + CDP screenshots -> ffmpeg)
  demo-comp.js         demo composition (27.7 s) -> demo.mp4, demo-sheet.png
  lib/easing.js        easing + interpolate() + keyframe track() (Node and browser)
  lib/timeline.js      authoring helpers: wipeAt(), phoneSlide(), at(), s()
  lib/resolve.js       Node-side comp resolution (paths, seq scan, image sizes, CSV parse)
  lib/lod.js           half / quarter resolution proxies of big sequences (cached in .cache/lod)
  lib/server.js        static server (+ /api/comp for the preview page)
  runtime/             browser runtime: core.js, components/*.js, styles.css, brand.js
  runtime/preview.html scrubbable live preview
  capture/capture-login.js  example: capture a screenshot sequence of the real app (offline)
  samples/bemexo-paie-2026-09-21.csv  REAL payroll export written by the app (lib/export-utils.ts payrollCsv)
                                      against the demo backend: UTF-8 BOM, `;`, CRLF, decimal comma
  samples/bemexo-paie-2026-09.csv     same content (kept so older references do not break)
  tests/components.js  exercises split / still / chip card / alsoStrip / light themes / html
```

## Render

```bash
cd compositor
node render.js demo-comp.js --out demo.mp4 --contact-sheet demo-sheet.png          # full render
node render.js demo-comp.js --out part.mp4 --from 270 --to 470                     # frame range [from, to)
node render.js demo-comp.js --stills 0,45,300 --stills-dir out/stills              # stills only (fast, no video)
node render.js demo-comp.js --stills 300 --stills-format png --stills-dir out/png  # PNG still
node render.js demo-comp.js --out demo.mp4 --workers 1                             # force a single page (default: 2 for >= 150 frames)
node render.js demo-comp.js --out draft.mp4 --draft                                # fast preview encode (veryfast, crf 20, q85)
```

Options:

| option | default | notes |
|---|---|---|
| `--out file.mp4` | — | Encodes with `libx264 -preset medium -crf 16 -pix_fmt yuv420p -movflags +faststart` at 30 fps, BT.709 tags, full-to-TV range conversion. Use `--preset slow` for a master if you want (55.4 vs 54.3 dB against the same source, same size, +30 % encode CPU). |
| `--from N --to M` | whole comp | `to` is exclusive. |
| `--stills a,b,c --stills-dir d` | — | Writes `fNNNNN.jpg` (q95). Add `--stills-format png` for PNG. |
| `--contact-sheet f.png` | — | Makes a grid of `--sheet-count` (24) evenly spaced frames, or of the frames given with `--sheet-frames a,b,c`. |
| `--workers N` | 2 if the encode is ≥ 150 frames, else 1 | Splits the range into N contiguous chunks, one page + one x264 each, then `ffmpeg concat -c copy`. Seams are invisible (frame count and timestamps checked, 54 dB vs 1 worker). |
| `--crf`, `--preset`, `--quality` | 16, medium, 95 | `--quality` is the JPEG quality of the captured frames. |
| `--draft` | off | Preview encode: `veryfast`, crf 20, q85 captures. |

Env overrides: `CHROME=`, `FFMPEG=`, `CHROME_ARGS=` (extra Chromium flags), `NO_LOD=1` (disable proxies), `NO_REUSE=1` (always take a real screenshot, for checks).

How rendering works:
- Each render starts its own server on an ephemeral port, so parallel renders never collide.
- For every frame it calls `window.renderFrame(f)`. That sets the DOM purely from `f`, and CSS transitions and animations are globally disabled.
- It then waits until every changed `<img>` has its bytes (`load`) and fonts are ready. It does **not** call `img.decode()` any more: media `<img>` are `decoding="sync"`, so the raster decodes them inside the screenshot at the drawn scale (decode() decoded at natural size first = double work; preloading 6 frames × 2 sequences with decode() also thrashed the decode cache).
- Sequences of ≥ 2.5 MP (3200×1800 desktop, 1170×2532 mobile) get **LOD proxies** (half and quarter size, `lib/lod.js`, built once with ffmpeg `area` filter and cached in `.cache/lod/`). Each frame the runtime measures the on-screen scale of every sequence (all transforms included) and uses the smallest level that is still drawn at ≤ 1:1, never upscaled. Same pixels as Chromium's own mip level (41-50 dB vs full-res path, sub-pixel filtering only); 4× / 16× fewer pixels to decode.
- **Static frames are free**: a MutationObserver on the stage tells whether `renderFrame(f)` changed anything; if not, the previous capture is reused (checked byte-identical against a real screenshot). `html` layers (which may draw into a canvas) always count as changed; set `alwaysDirty: true` on any other layer that paints without touching the DOM.
- It captures a CDP `Page.captureScreenshot` JPEG q95 and pipes it to ffmpeg `image2pipe`.
- **Zero network**: every non-local page request is aborted, and Chromium runs with a dead `--proxy-server` plus `--disable-background-networking/--disable-component-update…`, so its own background services (which otherwise contacted www.google.com / redirector.gvt1.com at startup) cannot reach anything. Loopback (the compositor server) is not proxied.
- **Determinism**: `--disable-partial-raster` makes a frame independent of what was rendered before it (see below).

The preview server listens on port 4700, which is reserved for the compositor: `node lib/server.js` then open
`http://127.0.0.1:4700/runtime/preview.html?comp=/abs/path/to/comp.js&f=300`. It gives you a scrubber and best-effort real-time play.

### Measured speed (this 4-CPU VM, shared with another agent at load average 4-6)
Same machine, same minutes, same comp (A/B runs back to back):

| run | original renderer | this version |
|---|---|---|
| demo (830 f), 1 page | 7.8 fps | 9.0 fps (108 static frames reused) |
| demo (830 f), default (2 pages) | — | **10.7-11.8 fps** (70-77 s) |
| 2 × 3200×1800 sequences changing every frame (`../verify/bench-comp.js`), full encode | 3.5-3.7 fps | 4.0-4.1 fps (1 or 2 pages: CPU-bound) |
| same, capture only (no x264) | 3.9 fps | 5.0 fps |

- A 2-minute video (3600-3900 frames) takes **about 5-7 min** with the defaults on this shared VM (the 130 s timeline in `../final` included), faster when the other agent is idle.
- The floor is the screenshot itself: ~40 ms for a trivial page, ~70 ms with the cream background + noise (noise makes every JPEG ~500 KB and costs ~30 ms in encode/transfer/decode), ~150 ms with two big sequences decoding every frame.
- Costly on purpose, use sparingly: `anim.dim` (filter on a large group, ~10 % in phone scenes), `blur`, many big sequences changing every frame.

**Determinism:** the same frame renders byte-identically across runs, and — with `--disable-partial-raster` — also whether it is reached sequentially, by random access (`--stills`) or by another worker. The only residual is ≤ 1 level on a few edge pixels of elements that moved earlier in the same page (72 dB). Before this flag, whole 256 px tiles differed by ±2 levels (53-60 dB) depending on history.

## Composition format

A composition is a CommonJS module. It can also export a function that returns the object.

```js
const path = require('path');
const { wipeAt, phoneSlide, at, s } = require('./lib/timeline');
module.exports = {
  fps: 30, width: 1920, height: 1080,
  durationInFrames: 900,            // optional: defaults to max(from + duration)
  background: '#15120F',            // stage colour behind everything
  layers: [                         // alias: scenes
    { type: 'intro', from: 0, duration: 270 },
    { type: 'background', from: 270, duration: 300, props: { variant: 'cream', watermark: true } },
    { type: 'seq', from: 270, duration: 300, box: { x: 240, y: 150, w: 1440, h: 856 }, props: { dir: '../captures/planning', frame: 'browser', camera: [...] } },
    wipeAt(270),
  ],
};
```

**Common layer fields**, which every type accepts:

| field | meaning |
|---|---|
| `type` | component name (see below) |
| `from`, `duration` | frames, relative to the parent (the comp, or the enclosing `group`) |
| `trimStart` | skips the first N local frames of the layer, like a trim-in |
| `box: {x,y,w,h}` | position and size in the parent, in px. Default: the full parent. |
| `z` | explicit z-index. Otherwise array order gives z-order, and later layers are on top. |
| `anim` | keyframe tracks: `x, y, scale, rotate, opacity, dim, blur, brightness`. Format: `[[frame, value, easeIntoThisKey?], ...]` (local frames). |
| `origin` | CSS transform-origin (default `50% 50%`) |
| `enter` / `exit` | preset (see below), or `{preset, dur, delay, ease, distance, at}`. Exit defaults to the end of the layer. |
| `dimMode` | `'filter'` (default: warm `brightness()+sepia()`, dims only painted pixels) or `'overlay'` (ink overlay on the whole box). |

**Presets:**
- `fade`, `rise` (+24 px), `drop`
- `fromRight`, `fromLeft`, `fromTop`, `fromBottom` (the `distance` default is the frame size)
- `fadeRight`, `fadeLeft`, `scale`, `zoom`, `none`
- Exit aliases: `toRight`, `toLeft`, `toTop`, `toBottom`, `fall`, `lift`

The enter default is 12 frames `easeOutCubic`. The exit default is 8 frames `easeInCubic`.

**Paths.** Props named `src` (image), `dir` (image sequence) and `file` (CSV) are resolved relative to the comp file. Files must live under the scratchpad, because the server only serves the scratchpad and `/opt`.

**Functions.** A `render` or `mount` function in a comp is serialised with `toString()`. It must be self-contained, with no closures over Node variables.

### Easing and interpolation (`lib/easing.js`, also `window.Easing`)
- Easings: `linear`, `easeIn/Out/InOut{Quad,Cubic,Quart}`, `easeInOutSine`, `easeOutSine`, `easeIn/Out/InOutExpo`, `easeOutBack`, `smooth` (the default for cameras), `spring`, `springSoft`, `springBouncy`, `wipe`, and `cubicBezier(a,b,c,d)`.
- `interpolate(frame, [in...], [out...], { easing, clamp })` works like Remotion. `easing` can be one easing or an array, one per segment.
- `track(keys, frame, defaultEase)` is the keyframe evaluator used by `anim`. Values can be numbers or objects.
- `rng(seed)` is a deterministic PRNG. `sec(s)` converts seconds to frames.

### Timeline helpers (`lib/timeline.js`)
- `wipeAt(cut, {dur=14})` returns a ribbonWipe layer centred on `cut`, with `z: 100`.
- `phoneSlide({at, dur=20, outAt?, outDur=16, scale=.94, dim=.74, distance=1000})` returns `{desktopAnim, phoneEnter, phoneExit}`.
- `at(offset, layers)` shifts a list of layers, so you can build a scene at 0 and then place it.
- `s(seconds)` converts seconds to frames.

## Components (props)

### 1. `background`
`{ variant: 'black'|'ink'|'cream'|'parchment'|'color', color, watermark: true|{opacity,size,x,y,rotate,drift}, noise: true, ribbon: false|{edge:'top-right', w, h} }`

- `black` is the login-page radial ink.
- `cream` is `#F2EDE3` with a huge faint BEMEXO X that drifts slowly (3.5 % zoom over the layer).

### 2. `seq`: image sequence captured from the app
`{ dir, camera, startFrame=0, rate=1, hold:'last'|'loop'|'none', freezeAt, freezeFrame, timeMap, frame:'none'|'card'|'browser', url, theme:'dark', radius, background, clamp=true }`

- **Frames.** `dir` holds `000001.jpg…` (png/webp also work), sorted numerically, at any size. The source fps is taken as 30, so use `rate` to change speed.
- **Source frame for a local frame `lf`:** `startFrame + lf*rate`.
  - `freezeAt: N` stops time at local frame N. `freezeFrame` can force a specific source frame from that point.
  - `timeMap: [[lf, srcFrame], ...]` replaces all of the above with a linear time remap, which also handles holds and speed ramps.
- **Camera** (in source pixels):
  - Forms: `'full'` (contain), `'cover'`, `{x,y,w,h}`, `{cx,cy,zoom}`, `{cover:true, zoom, ax, ay}`, or keyframes `[{f, x,y,w,h, ease}, ...]`.
  - The requested rect is expanded to the box aspect, so it stays fully visible, and it is clamped inside the image.
  - Between keyframes the zoom is log-space, about the rect pair's fixed point. That gives a natural "zoom towards the thing" move. The default ease is `smooth`.
- **Frame styles.** `frame: 'browser'` draws a minimal browser chrome: 46 px bar, three dots and a URL pill (`url`). `card` adds a radius and shadow.
- **Preloading.** The bytes of the next 6 source frames are prefetched (no decode). Big sequences switch automatically between full, half and quarter resolution proxies (see *How rendering works*); `lod: false` at comp level disables it.

### 3. `still`
The same props as `seq`, with `src` instead of `dir`. Use it for Ken Burns moves on photos, for example `camera: [{f:0, cover:true}, {f:90, cover:true, zoom:1.25, ax:.3, ay:.4}]`.

`image` is a plain positioned image (logos): `{ src, fit:'contain'|'cover' }`.

### 4. `phone`: generic modern phone
It has a rounded graphite body, a thin bezel, a punch-hole camera, side buttons on the right, a glass reflection and a soft shadow. It is not an Apple lookalike.

`{ x, y, height=900, screen: { dir|src, camera, startFrame, rate, timeMap, ... }, statusBar: true|false|{time:'08:12', bg:'#15120F', color:'#F2EDE3', height:34}, taps: [{f, x, y}], notifications: [{from, duration, title, body, app:'BEMEXO', time:'maintenant'}] }`

- `x`, `y` are the phone centre in the layer box.
- `height` is the rendered body height in px.
- The screen is 390×844 CSS px. Sources of 1170×2532 (DPR 3) fit exactly. The camera is in source px and gives the inner zoom.
- The status bar is added above the app content.
- `taps` coordinates are screen CSS px (0..390, 0..844, excluding the status bar). Each tap shows a yellow dot plus a ripple, starting at frame `f`, for about 22 frames.
- Slide in and out with `enter:{preset:'fromRight', distance:1000, dur:20}` and `exit:{preset:'toRight'}`.

### 5. Text overlays (brand style)

**(a) `kicker`**: `{ text:'03 · PROUVER' | num+label, position:'top-left', theme:'dark'|'light', ribbon:true, margin:64 }`

The pill uses JetBrains Mono 700 22 px, uppercase, letter-spacing .14em, in yellow. The number is cream and a small hatched chip sits on the left. It slides in 18 px and fades.

**(b) `title`**: lower-third. `{ text:'Le bureau voit {tout}', sub, position:'bottom-center'|'bottom-left'|..., size:50, theme:'dark'|'light', ribbon:true, maxWidth, margin:64, delay }`

- The text is Archivo 900 in cream, on a black rounded pill with the Total-card ruban in the top-right corner.
- `{…}` marks yellow-highlighted words. The highlighter sweeps in over frames 7–18. The highlighted words keep the surrounding text colour until the marker reaches them and turn ink exactly under it (markup: `<span class="hl"><span class="hl-t">…</span></span>`, `--hl` = marker %, `--hlp` = 0..1). A highlight that opens a line (`'{depuis le chantier.}'`) bleeds left so its glyphs stay aligned with the other lines.
- Enter: rise 24 px + fade over 12 frames. Exit: fade over 8 frames.

**(c) `caption`**: side caption for phone scenes. `{ kicker, text:'Pointer\n{depuis le chantier.}', body, theme:'light'|'dark', x=150, y (default: vertically centred), width=760, size=84, align, scrim:false|0..1, delay }`

- `light` is dark text on cream. `dark` is cream text on dark.
- Lines rise one after another, 5 frames apart.
- `scrim` adds a soft gradient behind the text for busy or dimmed backgrounds.

**(d) `chip`**: time-jump. `{ text:'16:45' | '30 septembre — fin du mois', sub, icon:'clock'|'calendar'|'none', variant:'chip'|'card', position:'top-center', margin:64, size, dim:.62 }`

- `variant:'card'` shows a centred black card with a 150 px mono yellow time, a label and a hatched top band, over a dimmed scene.

Positions for (a), (b) and (d): `'top-left'|'top-center'|'top-right'|'bottom-*'|'center'` or `{x, y, anchor}`.

`text` is a generic rich text: `{ text|html, style:{...css}, className, io:true, delay }`.

### 6. `ribbonWipe`
`{ fill:'#15120F', hatch:110, stripe:16, hold:520, direction:'down-right'|'up-right', ease:'wipe' }`

- A diagonal band sweeps across the frame: a hatched edge, then a solid ink body, then a hatched edge.
- It covers the whole frame for about 3 frames around its middle frame.
- Place it with `wipeAt(cut)` (`from = cut − 7`, `duration = 14`) and cut the scenes at `cut`.
- Set `fill:'#F2EDE3'` to cut through cream.

### 7. Phone slide-in transition
This is a recipe, not a layer:

```js
const t = phoneSlide({ at: 80, dur: 20 });
{ type:'background', ..., anim:{ dim: t.desktopAnim.dim } }
{ type:'group', from: 0, duration: 200, anim: t.desktopAnim, children:[ desktopSeq ] }
{ type:'phone', from: 80, duration: 120, enter: t.phoneEnter, props:{...} }
```

- The desktop scales to 0.94 and gets a warm dim while the phone arrives from the right with `easeOutCubic`.
- For the reverse, pass `outAt` and end the phone layer at `outAt + outDur`, using `exit: t.phoneExit`.

### 8. `split`
`{ left:{type, props, box?}, right:{type, props}, ratio:.5, gap:0, divider:{color:'#FFC21A', width:6, draw:14} }`

The children are full layer specs (seq, still, phone, …). The divider grows from the centre.

### 9. `notification`: generic push banner
- Inside a phone: use `phone.props.notifications`.
- Standalone: `{ title, body, app, time, width:380, scale:1 }`. The layer `box` gives its position.

It has an app icon (the BEMEXO X on a black rounded square), the app name and time, a title and a body. It slides down with a soft spring over 20 frames and slides up out over the last 12 frames.

### 10. `csvTable`
`{ file, caption (default: file name), meta (default 'N lignes · séparateur ; · UTF-8 BOM'), columns:[names|indices], highlight:[names], highlightRows:[i], labels:{header:'Display'}, scroll:[[f,rowOffset,ease]], rowHeight:54, headerHeight:60, fontSize:19 }`

- It reads any `;`, `,` or tab CSV, with or without a BOM, CRLF or LF.
- Identifier columns (`00017`, `S-0012`) are mono, left-aligned. Quantities (`151,67`, `26h00`, `21/09/2026`, `3 845,16 €`) are mono, right-aligned.
- A short file gives a card that hugs its rows; `scroll` is clamped so it never scrolls past the last row.
- The header is black and in mono. Rows are zebra cream.
- Numeric columns are detected automatically (≥60 % numeric-looking cells) and set right-aligned in tabular JetBrains Mono.
- Highlighted columns get a yellow header text, a 5 px yellow underline that draws in at frames 16–28, and a tinted column.
- Columns are sized from the measured text. If the table is too wide, the font is scaled down to a minimum of 62 %.
- Rows cascade in. `scroll` is in rows. The caption file chip sits above the table.

### 11. `intro` (270 frames)
`{ kicker, chips:[...], title:'Une seule saisie. {Tout suit.}', wordmarkY:418, titleY:640, timing:{...} }`

| frames | what happens |
|---|---|
| 2–46 | the hatched ribbon crosses corner to corner, then leaves |
| 34–70 | the X draws itself: cream stroke, then yellow stroke |
| 78–110 | the X merges into the wordmark X while BEME and O reveal outwards |
| 108 | kicker |
| 122 / 138 / 154 | chips appear, each struck through by a yellow line 12 frames later |
| 186 | chips fade, and the title rises with its highlighter sweep |
| 216–270 | static hold, apart from a slow 1.8 % push-in |

Put `wipeAt(270)` after it.

### 12. `outro` (240 frames)
`{ thumbs:[{src|dir, label?, camera?, startFrame?} ×6], labels:['PLANIFIER','POINTER','PROUVER','CONTRÔLER','PILOTER','PAYER'], line, url:'bemexo.com', offer:'Essai gratuit 30 jours, sans engagement', legal:'Données de démonstration fictives', mosaicEnd:63, wordmarkY:400 }`

| frames | what happens |
|---|---|
| 0–63 | 3×2 mosaic pops in, cards 4 frames apart |
| 56–70 | built-in ribbon wipe |
| 63+ | wordmark, then the line with « sans ressaisie. » highlighted, the mono URL line, and the tiny legal line bottom-right |

Everything is static from about frame 140 to 240, so the hold is more than 1.5 s. Thumbs default to `camera:'cover'`.

### 13. `alsoStrip`: « Et aussi… »
`{ title:'Et aussi…', kicker, items:[{src|dir, label, camera, startFrame}×4], per:45, lead:0, theme:'light'|'dark', cardW:1360, cardY:218, background:true }`

- One large 16:9 card is shown per item for `per` frames (1.5 s).
- Each new card slides in from the right with `easeOutQuart` over 12 frames. The previous card slides out to the left.
- Labels sit in a black pill with a mono number. Progress segments are at the top right.
- Duration is about `lead + 4*per + 12`.

### Also available
- `group`: `children:[...]`, frames relative to the group, plus `props.background` and `props.clip`.
- `html`: custom layer. `{ html, css, mount(el, props, R, E, state), render(lf, el, props, R, E, state, dur) }`.

## Things the timeline author must know
- **Frames and cuts.** Everything is in frames at 30 fps, and `to` is exclusive. The wipe covers the frame for about 3 frames around `cut`, so hard-cut scenes exactly at `cut`.
- **Fonts.** Archivo and JetBrains Mono load from `../assets/fonts` (the local Google Fonts copy). Accents, «», …, —, œ and € are all covered.
- **App captures.** Capture at 1600×900 DPR 2 (3200×1800) for desktop and 390×844 DPR 3 (1170×2532) for mobile. Disable caret and animations while capturing (see `capture/capture-login.js`). For captures, use `../assets/fonts/route-fonts.js` → `installFontRoutes(context)` so the app's Google Fonts `@import` is served offline.
- **Keep it static during holds.** Layers are cheap. Big `blur` is expensive, so use `dim` instead. Seq frames decode on demand and the next 6 are preloaded.
- **Payroll CSV.** Show the app's real export format (`samples/bemexo-paie-2026-09-21.csv`, produced by the app itself): `Matricule;Nom;Prenom;Semaine du;Semaine au;Heures normales;Heures sup 25%;Heures sup 50%;Dont route payee;Total heures;Base hebdo;Controle h:min`, one line per salarié × semaine. The app's CSV has **no** paniers / trajets / absences columns (paniers are in the Excel and PDF exports), so do not show such columns as « export paie ».
- **Photos** (`../assets/photos`) read as site photos up to ~200 px on screen; at 400 px and above they look like clean 3D renders. Prefer them small or brief; 01, 03, 06 and 11 hold up best in close-up.
- **No audio.** Mux music or voice afterwards: `ffmpeg -i video.mp4 -i audio.m4a -c:v copy -c:a aac -shortest out.mp4`.
- **Chromium flag gotcha**: the renderer passes `--proxy-server=http://127.0.0.1:9`; a comp that needs a remote URL will get nothing (by design: everything must be local).
- **Demo length.** The demo is 27.7 s, not 20 s, because the spec fixes the intro (9 s) and outro (8 s) at full length. The middle is about 10.7 s.
