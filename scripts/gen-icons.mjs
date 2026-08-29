// Regenerates the app icons from assets/brand/icon-source.jpg. Run only when the
// source art changes - the outputs (app/icon.png, app/apple-icon.png) are
// committed. `sharp` is not a project dependency; install it just for this:
//
//   npm i -D sharp && node scripts/gen-icons.mjs && npm uninstall sharp
//
// Next.js App Router picks the outputs up automatically:
//   app/icon.png        -> <link rel="icon">            (browser tab / favicon)
//   app/apple-icon.png  -> <link rel="apple-touch-icon"> (iOS home screen)
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets', 'brand', 'icon-source.jpg');

const targets = [
  { out: 'app/icon.png', size: 256 },
  { out: 'app/apple-icon.png', size: 180 },
];

for (const { out, size } of targets) {
  const info = await sharp(src)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toFile(join(root, out));
  console.log(`wrote ${out} (${size}x${size}, ${(info.size / 1024).toFixed(0)} KB)`);
}
