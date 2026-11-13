import { assetURL } from './asset-paths.js';
import { showMatches, resetMatches } from './match-ui.js';
import { planTiles, processPixels, collectLines, readingOrder } from './ocr-utils.js';
const $ = id => document.getElementById(id);
let progressListener = null;
let bitmap = null, worker = null, busy = false, runToken = 0, loadToken = 0, sourceName = '', result = null;
function status(text, percent = 0) { $('status').textContent = text; $('progress').value = percent; $('percent').textContent = percent ? `${Math.round(percent)}%` : ''; }
function controls() {
  $('run').disabled = !bitmap || busy; $('clear').disabled = busy || !bitmap;
  $('cancel').hidden = !busy; $('layout').disabled = $('preprocess').disabled = busy;
  $('file').disabled = busy;
}
function resetResult() { resetMatches(); result = null; controls(); }
async function load(file) {
  if (busy) return;
  const token = ++loadToken;
  try {
    if (!file || !['image/png','image/jpeg','image/webp','image/bmp'].includes(file.type)) throw new Error('Choose a PNG, JPG, WebP or BMP image.');
    if (file.size > 40 * 1024 * 1024) throw new Error('This image exceeds the 40 MB limit. Please crop or resize it.');
    status('Opening image…');
    const next = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (token !== loadToken) { next.close(); return; }
    if (next.width * next.height > 80000000 || next.width > 60000 || next.height > 60000) { next.close(); throw new Error('Image exceeds 80 megapixels or 60,000 pixels per side. Please crop or resize it.'); }
    bitmap?.close(); bitmap = next; sourceName = file.name || 'image';
    if ($('image').src.startsWith('blob:')) URL.revokeObjectURL($('image').src);
    $('image').src = URL.createObjectURL(file);
    $('filename').textContent = sourceName; $('dimensions').textContent = `${bitmap.width.toLocaleString()} × ${bitmap.height.toLocaleString()} px`;
    $('drop').hidden = true; $('preview').hidden = false; resetResult(); status('Image ready. Choose settings and extract text.');
  } catch (error) { if (token === loadToken) status(error.message); }
  controls();
}
$('file').addEventListener('change', e => { load(e.target.files[0]); e.target.value = ''; });
$('drop').addEventListener('keydown', e => { if (['Enter',' '].includes(e.key)) { e.preventDefault(); $('file').click(); } });
for (const event of ['dragenter','dragover']) $('drop').addEventListener(event, e => { e.preventDefault(); $('drop').classList.add('drag'); });
for (const event of ['dragleave','drop']) $('drop').addEventListener(event, e => { e.preventDefault(); $('drop').classList.remove('drag'); if (event === 'drop') load(e.dataTransfer.files[0]); });
document.addEventListener('paste', e => { const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/')); if (file && !busy) load(file); });
$('clear').addEventListener('click', () => {
  ++loadToken; bitmap?.close(); bitmap = null;
  URL.revokeObjectURL($('image').src); $('image').removeAttribute('src');
  $('drop').hidden = false; $('preview').hidden = true; resetResult(); status('Add an image to get started');
});
$('cancel').addEventListener('click', async () => {
  ++runToken; busy = false; const old = worker; worker = null;
  if (old) await old.terminate();
  status('Recognition canceled. You can try again.'); controls();
});
$('run').addEventListener('click', async () => {
  if (!bitmap || busy) return;
  busy = true; resetResult(); controls(); const token = ++runToken;
  const tiles = planTiles(bitmap.width, bitmap.height);
  let activeTile = -1;
  progressListener = message => {
    if (token !== runToken) return;
    if (activeTile >= 0 && message.status === 'recognizing text') status(`Reading section ${activeTile + 1} of ${tiles.length}…`, 5 + 95 * (activeTile + (message.progress || 0)) / tiles.length);
  };
  try {
    if (!worker) {
      status('Loading local OCR engine…');
      const created = await Tesseract.createWorker('eng', 1, {
        workerPath: assetURL('vendor/worker.min.js'), corePath: assetURL('vendor/core/'), langPath: assetURL('vendor/lang'),
        workerBlobURL: false, logger: message => progressListener?.(message)
      });
      if (token !== runToken) { await created.terminate(); return; }
      worker = created;
    }
    await worker.setParameters({ tessedit_pageseg_mode: $('layout').value === 'block' ? '6' : '11', preserve_interword_spaces: '1', user_defined_dpi: '150' });
    const lines = [];
    for (let i = 0; i < tiles.length; i++) {
      if (token !== runToken) return;
      activeTile = i; const tile = tiles[i];
      status(`Preparing section ${i + 1} of ${tiles.length}…`, 5 + 95 * i / tiles.length);
      const canvas = document.createElement('canvas'); canvas.width = tile.width; canvas.height = Math.round(tile.height * tile.scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, tile.y, bitmap.width, tile.height, 0, 0, canvas.width, canvas.height);
      if ($('preprocess').value !== 'original') {
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        processPixels(pixels.data, $('preprocess').value); ctx.putImageData(pixels, 0, 0);
      }
      const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
      canvas.width = canvas.height = 1;
      if (token !== runToken) return;
      lines.push(...collectLines(data.blocks, tile));
    }
    const sorted = readingOrder(lines);
    const text = sorted.map(l => l.text).join('\n');
    const confidence = sorted.length ? sorted.reduce((sum, l) => sum + l.confidence, 0) / sorted.length : 0;
    result = { source: sourceName, width: bitmap.width, height: bitmap.height, language: 'eng', preparation: $('preprocess').value, confidence, text, lines: sorted };
    await showMatches(result, bitmap);
    if (token !== runToken) return;
    status(sorted.length ? 'Done. Review the skill checks below.' : 'No text found. Try original colors or a different layout.', 100);
  } catch (error) {
    if (token !== runToken) return;
    status(`OCR failed: ${error.message}. Check that npm install completed, then retry.`);
    const old = worker; worker = null; if (old) await old.terminate().catch(() => {});
  } finally { if (token === runToken) { busy = false; controls(); } }
});
