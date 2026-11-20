// Lists where the lines of words sit on each slide of a carousel, for writing its video script:
// each line's top (y), left and right edges (x) and how many word shapes it has, on the 1080x1350 slide.
//   node tools/lines.mjs h02_quoting_properly
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from './slide-layout.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(import.meta.url)(process.env.SHARP || 'C:/dev/jonra-command-centre/node_modules/sharp');
const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'desk/carousels.json'), 'utf8')).find((x) => x.slug === process.argv[2]);
if (!c) { console.log('No carousel with that slug.'); process.exit(1); }
for (const [i, s] of c.slides.entries()) {
  const px = await sharp(path.join(ROOT, 'desk/carousels', s)).resize(1080, 1350).removeAlpha().raw().toBuffer();
  const L = layout(px, c.theme !== 'light');
  console.log(`slide ${i + 1} (${s})`);
  for (const l of L.lines) console.log(`  y ${l.y0}-${l.y1}  x ${l.x0}-${l.x1}  ${l.words.length} word shapes`);
  if (L.keywords.length) console.log('  already green: ' + L.keywords.map((k) => `x ${k.x0}-${k.x1} y ${k.y0}-${k.y1}`).join(', '));
}
