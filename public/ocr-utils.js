// Process bounded-size sections without reducing long screenshots to tiny text.
export function planTiles(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new Error('Invalid image dimensions');
  const scale = Math.min(2, 1800 / width);
  const sourceHeight = Math.max(1, Math.floor(1800 / scale));
  const overlap = Math.min(Math.round(120 / scale), Math.floor(sourceHeight / 4));
  const step = sourceHeight - overlap;
  const tiles = [];
  for (let y = 0; y < height; y += step) {
    const h = Math.min(sourceHeight, height - y);
    tiles.push({ y, height: h, width: Math.max(1, Math.round(width * scale)), scale,
      keepTop: y === 0 ? 0 : y + overlap / 2,
      keepBottom: y + h >= height ? height : y + h - overlap / 2 });
    if (y + h >= height) break;
  }
  return tiles;
}
export function processPixels(data, mode) {
  if (mode === 'original') return;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let v;
    if (mode === 'game') {
      // Isolate warm, dark lettering, suppressing colorful cards and portraits.
      const isBrown = r > g * 1.13 && g > b * 1.08 && r - b > 35 && r < 205 && g < 165;
      v = isBrown ? 0 : 255;
    } else {
      v = Math.max(0, Math.min(255, (.299 * r + .587 * g + .114 * b - 128) * 1.5 + 128));
    }
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
}
export function collectLines(blocks, tile) {
  return (blocks || []).flatMap(b => (b.paragraphs || []).flatMap(p => p.lines || [])).map(line => {
    const { x0, y0, x1, y1 } = line.bbox;
    return { text: line.text.trim(), confidence: line.confidence,
      bbox: { x0: x0 / tile.scale, y0: y0 / tile.scale + tile.y, x1: x1 / tile.scale, y1: y1 / tile.scale + tile.y } };
  }).filter(l => l.text && (l.bbox.y0 + l.bbox.y1) / 2 >= tile.keepTop && (l.bbox.y0 + l.bbox.y1) / 2 < tile.keepBottom);
}
export function readingOrder(lines) {
  return [...lines].sort((a, b) => {
    const ah = a.bbox.y1 - a.bbox.y0, bh = b.bbox.y1 - b.bbox.y0;
    const dy = (a.bbox.y0 + a.bbox.y1 - b.bbox.y0 - b.bbox.y1) / 2;
    return Math.abs(dy) < Math.min(ah, bh) * .5 ? a.bbox.x0 - b.bbox.x0 : dy;
  });
}
