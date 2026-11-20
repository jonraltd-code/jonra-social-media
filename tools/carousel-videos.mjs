// Makes a silent vertical video (1080x1920, 30 fps) for each carousel in desk/carousels.json, and lists it in
// desk/videos.json with "carousel" set to that carousel's slug, so the command centre shows the two side by side.
//
// There is no voiceover, so the video reads the slides with the viewer. Each carousel has a script in
// tools/scripts/<slug>.json, written from what is on its slides: where to look first (a face, a photo), which lines
// to read and in what order, and the keywords to remember. The camera frames each block so every line is whole,
// moves at an easy reading pace, and the keywords turn JONRA green as the reader reaches them. A dark JONRA card
// opens it and a light one closes it.
// No captions are added: the slides carry the words. No music: Richard adds it in Instagram.
//
//   node tools/carousel-videos.mjs s01_start_here      one carousel
//   node tools/carousel-videos.mjs --all               every carousel
//   add --check to check the scripts without making any video
//
// Needs: ffmpeg (FFMPEG, or the copy inside CapCut), Chrome (CHROME) for the cards, and sharp (SHARP, or the
// command centre's copy). Nothing is uploaded or posted.

import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { layout } from './slide-layout.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESK = path.join(ROOT, 'desk');
const sharp = require(process.env.SHARP || 'C:/dev/jonra-command-centre/node_modules/sharp');
sharp.concurrency(4);

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const capcut = path.join(os.homedir(), 'AppData/Local/CapCut/Apps');
  const found = fs.existsSync(capcut) ? fs.readdirSync(capcut).map((v) => path.join(capcut, v, 'ffmpeg.exe')).filter((f) => fs.existsSync(f)) : [];
  const byVersion = (f) => path.basename(path.dirname(f)).split('.').map((n) => n.padStart(6, '0')).join('.');
  return found.sort((a, b) => byVersion(a).localeCompare(byVersion(b))).pop() || 'ffmpeg';
}
const FFMPEG = findFfmpeg();
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const W = 1080, H = 1920, FPS = 30;
const SLIDE_W = 1080, SLIDE_H = 1350, SLIDE_TOP = Math.round((H - SLIDE_H) / 2);
const PAD = 260;           // spare canvas round each picture, so the camera can pull back past the edges
const XF = 0.4;            // the move from one slide into the next

// Short titles for the opening cards: a light word or two, then the bold green part. Taken from each
// carousel's own words. A carousel not listed falls back to its slug.
const TITLES = {
  s01_start_here: ['New here?', 'Start here.'],
  r01_bakery_review: ['Client', 'review.'],
  c01_labour_ward: ['My', 'story.'],
  c02_called_at_8pm: ['I called', 'at 8pm.'],
  h01_get_it_in_writing: ['Get it', 'in writing.'],
  h02_quoting_properly: ['Quoting', 'properly.'],
  h03_follow_ups: ['Follow', 'up.'],
  h04_google_reviews: ['Google', 'reviews.'],
  h05_trade_website: ['Your trade', 'website.'],
  h06_get_organised: ['Get', 'organised.'],
  c01_quote_checklist: ['Quote', 'checklist.'],
  c02_first_hire: ['Your first', 'hire.'],
  c03_ready_to_grow: ['Ready', 'to grow?'],
  c04_weekly_check: ['Your weekly', 'check.'],
  m01_motivation: ['On', 'motivation.'],
  m02_word_of_mouth: ['Word', 'of mouth.'],
  m03_busy: ['Busy or', 'successful?'],
};
const titleOf = (c) => TITLES[c.slug] || ['', c.slug.replace(/^[a-z]\d+_/, '').replace(/_/g, ' ') + '.'];
const labelOf = (c) => String(c.type || 'JONRA').replace(/\s*\(.*\)\s*/g, '').trim();
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// ---------- The cards ----------

const MARK = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'tools/assets/mark.png')).toString('base64');
const FONT = '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;800&display=block" rel="stylesheet">';
const BASE_CSS = `
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
body{font-family:Poppins,sans-serif;position:relative}
.ghost{position:absolute;width:1700px;left:-310px;top:560px}
.logo{position:absolute;top:290px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:28px}
.logo img{width:142px}
.word b{display:block;font-weight:800;font-size:74px;letter-spacing:-1px;line-height:1}
.word span{display:block;font-weight:400;font-size:25px;letter-spacing:9px;margin-top:14px}
.mid{position:absolute;top:800px;left:90px;right:90px;text-align:center}
.eyebrow{display:flex;align-items:center;justify-content:center;gap:24px;font-weight:600;letter-spacing:8px;font-size:30px;text-transform:uppercase}
.eyebrow i{width:64px;height:3px;border-radius:2px;background:#69B32E}
h1{font-size:112px;line-height:1.06;margin:48px 0 0;font-weight:300;letter-spacing:-1px}
h1 b{display:block;font-weight:800}
.sub{font-size:40px;line-height:1.45;margin-top:44px;font-weight:400}
.foot{position:absolute;bottom:330px;left:0;right:0;text-align:center}
.foot i{display:block;width:64px;height:3px;border-radius:2px;background:#69B32E;margin:0 auto 30px}
.foot span{font-size:28px;letter-spacing:9px;font-weight:400}`;

const logo = (ink, sub) => `<div class="logo"><img src="${MARK}"><div class="word"><b style="color:${ink}">JONRA</b><span style="color:${sub}">CONSULTING LTD</span></div></div>`;

function openHtml(c) {
  const [light, bold] = titleOf(c);
  return `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE_CSS}
body{background:radial-gradient(120% 75% at 50% 32%,#0e1c2d 0%,#0a1523 48%,#060d16 100%);color:#fff}
.ghost{opacity:.075}.eyebrow{color:#93d85f}h1 b{color:#93d85f}.foot span{color:#c9d3df}</style></head><body>
<img class="ghost" src="${MARK}">${logo('#ffffff', '#dfe6ee')}
<div class="mid"><div class="eyebrow"><i></i>${esc(labelOf(c))}<i></i></div><h1>${esc(light)}<b>${esc(bold)}</b></h1></div>
<div class="foot"><i></i><span>jonraconsulting.co.uk</span></div></body></html>`;
}

// The end card uses Richard's own sign-off from the Start here carousel.
function endHtml() {
  return `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE_CSS}
body{background:radial-gradient(120% 75% at 50% 32%,#ffffff 0%,#fbfcfa 55%,#f1f4ef 100%);color:#0B1530}
.ghost{opacity:.09}h1{font-size:104px}h1 b{color:#4f9a24}.sub{color:#3d4a5c}.foot span{color:#33405a}</style></head><body>
<img class="ghost" src="${MARK}">${logo('#0B1530', '#33405a')}
<div class="mid" style="top:780px"><h1>Problems. Plan.<b>Progress.</b></h1>
<div class="sub">Tell me what’s stuck in your business.<br>The first conversation is free.</div></div>
<div class="foot"><i></i><span>jonraconsulting.co.uk</span></div></body></html>`;
}

async function renderCard(html, out, tmp) {
  const file = path.join(tmp, path.basename(out, '.png') + '.html');
  fs.writeFileSync(file, html);
  const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--force-device-scale-factor=1',
    `--user-data-dir=${path.join(tmp, 'chrome')}`, `--window-size=${W},${H}`, '--virtual-time-budget=15000', `--screenshot=${out}`, pathToFileURL(file).href], { encoding: 'utf8' });
  if (!fs.existsSync(out)) throw new Error('Chrome did not make the card: ' + (r.stderr || '').slice(-400));
  const m = await sharp(out).metadata();
  if (m.width !== W || m.height !== H) throw new Error(`Card came out ${m.width}x${m.height}`);
  return canvasOf(await sharp(out).removeAlpha().raw().toBuffer());
}

// ---------- Pictures the camera moves over ----------

/** A 1080x1920 picture with spare edge round it, copied outwards, so pulling back never shows a hard border. */
async function canvasOf(raw) {
  const { data, info } = await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, extendWith: 'copy' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { raw: data, w: info.width, h: info.height };
}

// The slide fills the width; above and below it is the slide's own edge colour, blended in over a soft edge.
async function slideCanvas(file, dark) {
  const px = await sharp(file).resize(SLIDE_W, SLIDE_H, { fit: 'cover' }).removeAlpha().raw().toBuffer();
  const avg = (y0, y1) => {
    const s = [0, 0, 0]; let n = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < SLIDE_W; x += 4) { const i = (y * SLIDE_W + x) * 3; s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; n++; }
    return s.map((v) => Math.round(v / n));
  };
  const top = avg(0, 6), bottom = avg(SLIDE_H - 6, SLIDE_H);
  const FEATHER = 70;
  const mask = Buffer.alloc(SLIDE_W * SLIDE_H);
  for (let y = 0; y < SLIDE_H; y++) {
    const a = Math.min(1, y / FEATHER, (SLIDE_H - 1 - y) / FEATHER);
    mask.fill(Math.round(255 * (a * a * (3 - 2 * a))), y * SLIDE_W, (y + 1) * SLIDE_W);
  }
  const slide = await sharp(px, { raw: { width: SLIDE_W, height: SLIDE_H, channels: 3 } }).joinChannel(mask, { raw: { width: SLIDE_W, height: SLIDE_H, channels: 1 } }).png().toBuffer();
  const bg = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const c = y < H / 2 ? top : bottom;
    for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; bg[i] = c[0]; bg[i + 1] = c[1]; bg[i + 2] = c[2]; }
  }
  const raw = await sharp(bg, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: slide, left: 0, top: SLIDE_TOP }]).removeAlpha().raw().toBuffer();
  return { canvas: await canvasOf(raw), plain: raw, found: layout(px, dark) };
}

// ---------- The camera ----------

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  land: (t) => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

/** Keeps the view on the slide: never past its sides, and never showing more band than it must. */
function keepOnSlide(cam) {
  if (cam.z < 1) return { ...cam, x: W / 2, y: H / 2 };
  const hw = W / 2 / cam.z, hh = H / 2 / cam.z;
  const ax = hw, bx = W - hw, ay = SLIDE_TOP + hh, by = SLIDE_TOP + SLIDE_H - hh;
  return { ...cam, x: clamp(cam.x, Math.min(ax, bx), Math.max(ax, bx)), y: clamp(cam.y, Math.min(ay, by), Math.max(ay, by)) };
}

/** Where the camera is at time t, from a list of stops: { t, x, y, z, e }. Zoom moves evenly on a log scale. */
function cameraAt(stops, t) {
  if (t <= stops[0].t) return stops[0];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    if (t <= b.t) {
      const k = (ease[b.e || 'inOut'])((t - a.t) / Math.max(1e-6, b.t - a.t));
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * k) };
    }
  }
  return stops[stops.length - 1];
}

const PACE = 4.4;          // words a second: a comfortable reading speed
const HOLD = 0.6;          // scales the pauses written in the scripts
const GREEN_ON = { dark: [0x93, 0xd8, 0x5f], light: [0x4f, 0x9a, 0x24] };

const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'-]/g, '');

/** Finds the script's lines on the slide and gives every word a box, in frame coordinates. */
function placeLines(found, beat, warn) {
  const lines = found.lines;
  let at = 0, best = Infinity;
  lines.forEach((l, i) => { const d = Math.abs(l.y0 - beat.at); if (d < best) { best = d; at = i; } });
  if (best > 40) warn(`no line near y ${beat.at} for "${beat.read[0]}"`);
  return beat.read.map((text, n) => {
    const l = lines[at + n];
    if (!l) { warn(`missing line "${text}"`); return null; }
    const tokens = text.split(/\s+/).filter(Boolean);
    let boxes = l.words.slice();
    if (boxes.length === tokens.length + 1 && boxes[0].x1 - boxes[0].x0 < 70) boxes = boxes.slice(1); // a numbered bullet
    if (boxes.length !== tokens.length) {
      // Fall back to spacing the words by their letters across the line.
      warn(`"${text}": ${boxes.length} word shapes for ${tokens.length} words, spacing by letters`);
      const x0 = boxes.length ? boxes[0].x0 : l.x0, x1 = boxes.length ? boxes[boxes.length - 1].x1 : l.x1;
      const chars = tokens.reduce((s, t) => s + t.length, 0) + tokens.length - 1;
      let c = 0;
      boxes = tokens.map((t) => { const a = x0 + ((x1 - x0) * c) / chars; c += t.length + 1; return { x0: a, x1: x0 + ((x1 - x0) * (c - 1)) / chars }; });
    }
    const y0 = l.y0 + SLIDE_TOP, y1 = l.y1 + SLIDE_TOP;
    return { x0: boxes[0].x0, x1: boxes[boxes.length - 1].x1, y0, y1, words: tokens.map((t, i) => ({ text: t, x0: Math.round(boxes[i].x0), x1: Math.round(boxes[i].x1), y0, y1 })) };
  }).filter(Boolean);
}

/** The word's pixels redrawn in green: the letters change colour, the background stays as it is. */
function greenWord(plain, w, dark) {
  const pad = 4;
  const x0 = Math.max(0, w.x0 - pad), x1 = Math.min(W, w.x1 + pad), y0 = Math.max(0, w.y0 - pad - 6), y1 = Math.min(H, w.y1 + pad + 6);
  const bw = x1 - x0, bh = y1 - y0;
  const Ls = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 3; Ls.push(lum3(plain[i], plain[i + 1], plain[i + 2])); }
  const sorted = Ls.slice().sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const bgL = dark ? q(0.3) : q(0.7), inkL = dark ? q(0.995) : q(0.005);
  const G = dark ? GREEN_ON.dark : GREEN_ON.light;
  const out = Buffer.alloc(bw * bh * 3);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = ((y0 + y) * W + x0 + x) * 3, o = (y * bw + x) * 3;
    const r = plain[i], g = plain[i + 1], b = plain[i + 2];
    const a = clamp((lum3(r, g, b) - bgL) / (inkL - bgL || 1), 0, 1);
    // Take the ink out, keeping what is behind it, then put green ink back in its place.
    const k = a * a * (3 - 2 * a);
    const base = [r, g, b];
    out[o] = base[0] + (G[0] - base[0]) * k; out[o + 1] = base[1] + (G[1] - base[1]) * k; out[o + 2] = base[2] + (G[2] - base[2]) * k;
  }
  return { x0, y0, w: bw, h: bh, px: out, ink: [w.x0, w.x1] };
}
const lum3 = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Which words of a beat are to turn green: each phrase in 'green', matched in reading order. */
function greenIndexes(words, phrases, warn) {
  const toks = words.map((w) => norm(w.text));
  const marked = new Set();
  for (const p of phrases) {
    const want = p.split(/\s+/).map(norm);
    let hit = -1;
    for (let i = 0; i + want.length <= toks.length && hit < 0; i++) if (want.every((t, j) => toks[i + j] === t && !marked.has(i + j))) hit = i;
    if (hit < 0) { warn(`green word "${p}" not found`); continue; }
    want.forEach((_, j) => marked.add(hit + j));
  }
  return marked;
}

/** Plans one slide from its script: the camera stops and when each green word changes. */
function planScripted(found, beats, plain, dark, warn) {
  const full = { x: W / 2, y: H / 2, z: 1 };
  const stops = [{ t: 0, ...full, z: 0.95 }, { t: 0.45, ...full, e: 'out' }];
  const greens = [];
  let t = 0.45;
  const go = (cam, dt, e = 'inOut') => { t += dt; stops.push({ t, ...keepOnSlide(cam), e }); };
  const hold = (dt, grow = 1.02) => { const s = stops[stops.length - 1]; go({ ...s, z: s.z * grow }, dt, 'linear'); };
  const frame = (x0, y0, x1, y1, maxZ = 2.1) => {
    const w = Math.max(x1 - x0, 420), h = Math.max(y1 - y0, 120);
    const z = clamp(Math.min(W / w, H / h), 1, maxZ);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z };
  };

  for (const b of beats) {
    if (b.whole != null) { go(full, 0.5); hold(b.whole * HOLD, 1.01); continue; }
    if (b.look) {
      const [x0, y0, x1, y1] = b.look;
      go(frame(x0, y0 + SLIDE_TOP, x1, y1 + SLIDE_TOP, 2.3), 0.6);
      hold((b.hold ?? 1) * HOLD);
      continue;
    }
    const lines = placeLines(found, b, warn);
    if (!lines.length) continue;
    const words = lines.flatMap((l) => l.words);
    const marked = greenIndexes(words, b.green || [], warn);
    const bx0 = Math.min(...lines.map((l) => l.x0)), bx1 = Math.max(...lines.map((l) => l.x1));
    const by0 = lines[0].y0, by1 = lines[lines.length - 1].y1;
    const lineH = (by1 - by0) / lines.length;

    if (b.mode === 'pan') {
      // Close in and travel along each line as it is read.
      const z = clamp(W / ((bx1 - bx0) * 0.68), 1.3, 2.0);
      const hw = W / 2 / z;
      let wi = 0;
      lines.forEach((l, n) => {
        const cy = (l.y0 + l.y1) / 2 + lineH * 0.3;
        const sx = l.x1 - l.x0 > 2 * hw - 80 ? l.x0 + hw - 50 : (l.x0 + l.x1) / 2;
        const ex = l.x1 - l.x0 > 2 * hw - 80 ? l.x1 - hw + 50 : sx;
        go({ x: sx, y: cy, z }, n === 0 ? 0.65 : 0.3);
        const start = t, dur = Math.max(0.6, l.words.length / PACE);
        l.words.forEach((w, i) => { if (marked.has(wi + i)) greens.push({ t: start + ((i + 0.6) / l.words.length) * dur, g: greenWord(plain, w, dark) }); });
        wi += l.words.length;
        go({ x: ex, y: cy, z }, dur, 'linear');
      });
      hold((b.hold ?? 0.5) * HOLD);
      continue;
    }

    // Frame the block so every line is whole and readable, and drift gently down it while it is read.
    const f = frame(bx0 - 50, by0 - 40, bx1 + 50, by1 + 40);
    go({ ...f, y: f.y - lineH * 0.15 }, 0.5);
    const start = t, dur = Math.max(0.7, words.length / PACE);
    words.forEach((w, i) => { if (marked.has(i)) greens.push({ t: start + ((i + 0.7) / words.length) * dur, g: greenWord(plain, w, dark) }); });
    go({ ...f, y: f.y + lineH * 0.15, z: f.z * 1.03 }, dur, 'linear');
    hold((b.hold ?? 0.5) * HOLD, 1.01);
  }
  const exitAt = t;
  go({ ...full, z: 1.1 }, XF, 'in');
  return { stops, greens, len: t, exitAt };
}

function planOpen() {
  const title = { x: W / 2, y: 1010 };
  return {
    stops: [{ t: 0, ...title, z: 1.3 }, { t: 1.6, x: W / 2, y: H / 2, z: 1, e: 'out' }, { t: 2.2, x: W / 2, y: H / 2, z: 1.015, e: 'linear' }, { t: 2.2 + XF, x: W / 2, y: H / 2, z: 1.1, e: 'in' }],
    greens: [], len: 2.2 + XF, exitAt: 2.2,
  };
}

function planEnd() {
  return {
    stops: [{ t: 0, x: W / 2, y: H / 2, z: 0.95 }, { t: 0.45, x: W / 2, y: H / 2, z: 1, e: 'out' }, { t: 1.4, x: W / 2, y: H / 2, z: 1 }, { t: 4.6, x: W / 2, y: 1010, z: 1.12, e: 'inOut' }],
    greens: [], len: 4.6, exitAt: 4.6, fadeOut: 0.45,
  };
}

/** One frame of a picture as the camera sees it, with the green words swept in so far. */
async function shoot(canvas, cam, greens) {
  const z = cam.z;
  const L = cam.x - W / 2 / z + PAD, T = cam.y - H / 2 / z + PAD;
  const iL = Math.floor(L), iT = Math.floor(T);
  const rw = Math.min(canvas.w - iL, Math.ceil(W / z + (L - iL)) + 3), rh = Math.min(canvas.h - iT, Math.ceil(H / z + (T - iT)) + 3);
  const region = Buffer.alloc(rw * rh * 3);
  for (let y = 0; y < rh; y++) canvas.raw.copy(region, y * rw * 3, ((iT + y) * canvas.w + iL) * 3, ((iT + y) * canvas.w + iL + rw) * 3);
  for (const { g, p } of greens) {
    // The colour sweeps across the word from left to right, with a soft leading edge.
    const edge = g.ink[0] + (g.ink[1] - g.ink[0] + 24) * p - 12;
    for (let y = 0; y < g.h; y++) {
      const ry = g.y0 + y + PAD - iT;
      if (ry < 0 || ry >= rh) continue;
      for (let x = 0; x < g.w; x++) {
        const k = clamp((edge - (g.x0 + x)) / 12, 0, 1);
        if (k <= 0) continue;
        const rx = g.x0 + x + PAD - iL;
        if (rx < 0 || rx >= rw) continue;
        const o = (ry * rw + rx) * 3, s = (y * g.w + x) * 3;
        region[o] += (g.px[s] - region[o]) * k; region[o + 1] += (g.px[s + 1] - region[o + 1]) * k; region[o + 2] += (g.px[s + 2] - region[o + 2]) * k;
      }
    }
  }
  const out = await sharp(region, { raw: { width: rw, height: rh, channels: 3 } })
    .affine([z, 0, 0, z], { interpolator: sharp.interpolators.bicubic, odx: -(L - iL) * z, ody: -(T - iT) * z })
    .raw().toBuffer({ resolveWithObject: true });
  return sharp(out.data, { raw: out.info }).extract({ left: 0, top: 0, width: W, height: H }).removeAlpha().raw().toBuffer();
}

function mix(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * t + 0.5;
  return out;
}

/** A clip's frame at its own time t. */
function clipFrame(clip, t) {
  const greens = clip.plan.greens.filter((g) => t >= g.t).map((g) => ({ g: g.g, p: ease.out(clamp((t - g.t) / 0.4, 0, 1)) }));
  return shoot(clip.canvas, cameraAt(clip.plan.stops, t), greens);
}

async function makeVideo(c, end, tmp) {
  const open = await renderCard(openHtml(c), path.join(tmp, `open_${c.slug}.png`), tmp);
  const scriptFile = path.join(ROOT, 'tools/scripts', c.slug + '.json');
  if (!fs.existsSync(scriptFile)) throw new Error(`No script for ${c.slug}: write tools/scripts/${c.slug}.json first`);
  const script = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
  if (script.slides.length !== c.slides.length) throw new Error(`${c.slug}: the script has ${script.slides.length} slides, the carousel ${c.slides.length}`);
  const clips = [{ canvas: open, plan: planOpen() }];
  let poster = null;
  for (const [i, s] of c.slides.entries()) {
    const dark = c.theme !== 'light';
    const sl = await slideCanvas(path.join(DESK, 'carousels', s), dark);
    poster ??= sl.plain;
    clips.push({ canvas: sl.canvas, plan: planScripted(sl.found, script.slides[i], sl.plain, dark, (m) => console.log(`  slide ${i + 1}: ${m}`)) });
  }
  if (CHECK) { console.log(`${c.slug}: script checked`); return null; }
  clips.push({ canvas: end, plan: planEnd() });

  // Each clip starts as the one before begins its dive out, so the two overlap for XF seconds.
  let at = 0;
  for (const k of clips) { k.start = at; at += k.plan.exitAt; }
  const last = clips[clips.length - 1];
  const total = last.start + last.plan.len;
  const frames = Math.round(total * FPS);

  const out = path.join(DESK, 'videos', `cv_${c.slug}.mp4`);
  const ff = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-f', 'lavfi', '-t', total.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'h264_nvenc', '-preset', 'p7', '-rc', 'vbr', '-cq', '29', '-b:v', '0', '-maxrate', '3M', '-bufsize', '6M',
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', '60',
    '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (code) => (code === 0 ? res() : rej(new Error('ffmpeg stopped with ' + code)))));

  for (let f = 0; f < frames; f++) {
    const t = f / FPS;
    const live = clips.filter((k) => t >= k.start && t < k.start + k.plan.len);
    let frame;
    if (live.length >= 2) {
      const [a, b] = live;
      const k = ease.inOut(clamp((t - b.start) / XF, 0, 1));
      frame = mix(await clipFrame(a, t - a.start), await clipFrame(b, t - b.start), k);
    } else {
      const k = live[0] || last;
      frame = await clipFrame(k, t - k.start);
      const fo = k.plan.fadeOut;
      if (fo && t - k.start > k.plan.len - fo) frame = mix(frame, Buffer.alloc(frame.length, 255), ease.inOut((t - k.start - (k.plan.len - fo)) / fo) * 0.85);
    }
    if (!ff.stdin.write(frame)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;

  const posterFile = path.join(DESK, 'videos', `cv_${c.slug}.jpg`);
  await sharp(poster, { raw: { width: W, height: H, channels: 3 } }).resize(432, 768).jpeg({ quality: 82, mozjpeg: true }).toFile(posterFile);
  return { file: path.basename(out), poster: path.basename(posterFile), seconds: Math.round(total) };
}

function listVideo(c, made) {
  const listFile = path.join(DESK, 'videos.json');
  const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  const entry = {
    slug: `cv_${c.slug}`,
    title: `${labelOf(c)}: ${titleOf(c).join(' ')}`.trim(),
    status: 'Silent, add music',
    theme: c.theme,
    check_facts: c.check_facts === true,
    carousel: c.slug,
    file: made.file,
    poster: made.poster,
    caption: c.caption,
    hashtags: c.hashtags,
  };
  const at = list.findIndex((v) => v.slug === entry.slug);
  if (at >= 0) list[at] = entry; else list.push(entry);
  fs.writeFileSync(listFile, JSON.stringify(list, null, 2) + '\n');
}

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const carousels = JSON.parse(fs.readFileSync(path.join(DESK, 'carousels.json'), 'utf8'));
const chosen = args.includes('--all') ? carousels : carousels.filter((c) => args.includes(c.slug));
if (!chosen.length) { console.log('Say which carousel, or --all.'); process.exit(1); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jonra-cv-'));
const end = await renderCard(endHtml(), path.join(tmp, 'end.png'), tmp);
for (const c of chosen) {
  const t = Date.now();
  const made = await makeVideo(c, end, tmp);
  if (!made) continue;
  listVideo(c, made);
  const mb = (fs.statSync(path.join(DESK, 'videos', made.file)).size / 1e6).toFixed(1);
  console.log(`${c.slug}: ${made.seconds}s, ${mb} MB, made in ${Math.round((Date.now() - t) / 1000)}s`);
}
fs.rmSync(tmp, { recursive: true, force: true });
