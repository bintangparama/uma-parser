import { cp, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(root + 'public/vendor/core', { recursive: true });
await mkdir(root + 'public/vendor/lang', { recursive: true });
for (const file of ['tesseract.min.js', 'worker.min.js']) {
  await cp(root + 'node_modules/tesseract.js/dist/' + file, root + 'public/vendor/' + file);
}
for (const file of await readdir(root + 'node_modules/tesseract.js-core')) {
  if (/\.wasm(\.js)?$/.test(file)) await cp(root + 'node_modules/tesseract.js-core/' + file, root + 'public/vendor/core/' + file);
}
await cp(root + 'node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz', root + 'public/vendor/lang/eng.traineddata.gz');
console.log('OCR engine and English model copied locally.');
