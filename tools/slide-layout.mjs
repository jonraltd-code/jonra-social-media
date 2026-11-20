// Finds where the words sit on a carousel slide, so the video camera can follow them: the lines of text,
// grouped into blocks, and the green keywords. It looks only at the pixels; it does not read the words.

const SW = 1080, SH = 1350;
// The logo sits above this and the web address and "Swipe" below it, on every slide.
const TOP = 265, BOTTOM = 1100;

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const isGreen = (r, g, b) => g > 110 && g - r > 35 && g - b > 45;

/** px: raw RGB, SW x SH. dark: navy slide (else light). */
export function layout(px, dark) {
  const ink = new Uint8Array(SW * SH);
  const green = new Uint8Array(SW * SH);
  for (let y = TOP; y < BOTTOM; y++) {
    for (let x = 0; x < SW; x++) {
      const i = (y * SW + x) * 3, r = px[i], g = px[i + 1], b = px[i + 2];
      const gr = isGreen(r, g, b);
      green[y * SW + x] = gr ? 1 : 0;
      const L = lum(r, g, b);
      ink[y * SW + x] = gr || (dark ? L > 165 : L < 120) ? 1 : 0;
    }
  }
  // Text rows have many on/off edges; a photo or a soft shape has few.
  const edgesOf = (y) => {
    let n = 0;
    for (let x = 1; x < SW; x++) if (ink[y * SW + x] !== ink[y * SW + x - 1]) n++;
    return n;
  };
  const rows = [];
  for (let y = TOP; y < BOTTOM; y++) rows.push(edgesOf(y) >= 10);

  // Rows into lines.
  const lines = [];
  let start = -1, gap = 0;
  for (let k = 0; k <= rows.length; k++) {
    const on = k < rows.length && rows[k];
    if (on) { if (start < 0) start = k; gap = 0; continue; }
    if (start >= 0 && ++gap > 5) { lines.push([start + TOP, k - gap + TOP]); start = -1; gap = 0; }
  }
  // Two tight headline lines can touch; split a line that is far too tall at its quietest row.
  const counts = rows.map((_, k) => (rows[k] ? edgesOf(k + TOP) : 0));
  for (let i = 0; i < lines.length; i++) {
    const [y0, y1] = lines[i];
    if (y1 - y0 < 85) continue;
    let at = -1, least = Infinity;
    for (let y = y0 + Math.round((y1 - y0) * 0.3); y <= y0 + Math.round((y1 - y0) * 0.7); y++) { const n = edgesOf(y); if (n < least) { least = n; at = y; } }
    const busy = counts.slice(y0 - TOP, y1 - TOP).sort((a, b) => a - b)[Math.floor((y1 - y0) * 0.5)];
    if (at > 0 && least < busy * 0.35) lines.splice(i, 1, [y0, at - 1], [at + 1, y1]);
  }
  const out = [];
  for (const [y0, y1] of lines) {
    if (y1 - y0 < 14) continue;
    // Where along the row the edges are: keep the widest run of busy columns, allowing word gaps.
    const bins = new Array(Math.ceil(SW / 8)).fill(0);
    for (let y = y0; y <= y1; y++) for (let x = 1; x < SW; x++) if (ink[y * SW + x] !== ink[y * SW + x - 1]) bins[x >> 3]++;
    const busy = bins.map((n) => n >= 3);
    // Words have many edges close together; a photo edge beside them has fewer, so the busiest run wins.
    let best = null, run = null, lastOn = -99;
    busy.forEach((on, b) => {
      if (!on) return;
      if (run && b - lastOn <= 8) { run[1] = b; run[2] += bins[b]; } else { run = [b, b, bins[b]]; }
      lastOn = b;
      if (!best || run[2] > best[2]) best = [...run];
    });
    if (!best || (best[1] - best[0]) * 8 < 60) continue;
    out.push({ x0: best[0] * 8, x1: best[1] * 8 + 8, y0, y1, h: y1 - y0 });
  }

  // Lines into blocks: a bigger gap or a change of size starts a new block.
  const blocks = [];
  for (const l of out) {
    const b = blocks[blocks.length - 1];
    const prev = b && b.lines[b.lines.length - 1];
    if (prev && l.y0 - prev.y1 < Math.max(prev.h, l.h) * 0.9 && Math.abs(l.h - prev.h) < Math.max(prev.h, l.h) * 0.35) b.lines.push(l);
    else blocks.push({ lines: [l] });
  }
  for (const b of blocks) {
    b.x0 = Math.min(...b.lines.map((l) => l.x0)); b.x1 = Math.max(...b.lines.map((l) => l.x1));
    b.y0 = b.lines[0].y0; b.y1 = b.lines[b.lines.length - 1].y1;
    b.h = b.lines.reduce((s, l) => s + l.h, 0) / b.lines.length;
  }

  // Green keywords: runs of green within a line, joined across word gaps. Thin rules and small dots are left out.
  const keywords = [];
  for (const l of out) {
    const cols = new Uint16Array(SW);
    for (let y = l.y0; y <= l.y1; y++) for (let x = 0; x < SW; x++) cols[x] += green[y * SW + x];
    let s = -1, last = -99;
    const runs = [];
    for (let x = 0; x < SW; x++) {
      if (cols[x] >= 2) { if (s < 0 || x - last > l.h * 0.8) { if (s >= 0) runs.push([s, last]); s = x; } last = x; }
    }
    if (s >= 0) runs.push([s, last]);
    for (const [a, z] of runs) {
      if (z - a < 70) continue;
      let gy0 = l.y1, gy1 = l.y0;
      for (let y = l.y0; y <= l.y1; y++) for (let x = a; x <= z; x += 2) if (green[y * SW + x]) { gy0 = Math.min(gy0, y); gy1 = Math.max(gy1, y); }
      if (gy1 - gy0 < 14) continue;
      keywords.push({ x0: a, x1: z + 1, y0: gy0, y1: gy1 + 1 });
    }
  }
  // Words: split each line where there is a clear gap between letters.
  for (const l of out) {
    const has = new Uint8Array(SW);
    for (let y = l.y0; y <= l.y1; y++) for (let x = l.x0; x < l.x1; x++) if (ink[y * SW + x]) has[x] = 1;
    const gapMin = Math.max(9, l.h * 0.2);
    l.words = [];
    let s = -1, last = -99;
    for (let x = l.x0; x < l.x1; x++) {
      if (!has[x]) continue;
      if (s < 0) s = x;
      else if (x - last > gapMin) { l.words.push({ x0: s, x1: last + 1 }); s = x; }
      last = x;
    }
    if (s >= 0) l.words.push({ x0: s, x1: last + 1 });
  }
  return { lines: out, blocks, keywords };
}

export const SLIDE = { SW, SH, TOP, BOTTOM };
