// Private subprocess. The parent supplies bytes through stdin and enforces a wall clock limit.
import sharp from 'sharp';
import { createWorker, OEM } from 'tesseract.js';
import portuguese from '@tesseract.js-data/por';
import { createRequire } from 'node:module';
import path from 'node:path';

const mimeFormats = new Map([['image/jpeg', 'jpeg'], ['image/png', 'png'], ['image/webp', 'webp']]);
const maxPixels = 16_000_000;
sharp.cache(false);
sharp.concurrency(1);

// Preserve visual rows and column spacing in text-based PDFs. PDF.js items can
// arrive out of reading order even when the PDF contains selectable text.
function pdfLayoutText(items) {
  const rows = [];
  let fallback = '';
  let missingPosition = false;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    fallback += item.str + (item.hasEOL ? '\n' : ' ');
    if (!item.str.trim()) continue;
    const matrix = item.transform;
    if (!Array.isArray(matrix) || !Number.isFinite(matrix[4]) || !Number.isFinite(matrix[5])) {
      missingPosition = true;
      continue;
    }
    const part = {
      text: item.str.trim(), x: matrix[4], y: matrix[5],
      width: Number(item.width) || 0, height: Number(item.height) || 10,
    };
    const tolerance = Math.min(3.5, Math.max(1.5, part.height * 0.28));
    let row = rows.find(line => Math.abs(line.y - part.y) <= tolerance);
    if (!row) { row = { y: part.y, parts: [] }; rows.push(row); }
    row.parts.push(part);
  }
  if (missingPosition || !rows.length) return fallback.trim();
  rows.sort((a, b) => b.y - a.y);
  return rows.map(row => {
    const parts = row.parts.sort((a, b) => a.x - b.x);
    let line = '';
    let end = -Infinity;
    let glyphWidth = 5;
    for (const part of parts) {
      const gap = part.x - end;
      if (line) {
        const spaces = gap > glyphWidth * 0.45
          ? Math.max(1, Math.min(18, Math.round(gap / glyphWidth))) : 0;
        line += ' '.repeat(spaces);
      }
      line += part.text;
      end = Math.max(end, part.x + part.width);
      glyphWidth = Math.min(16, Math.max(3, part.width / Math.max(1, part.text.length)));
    }
    return line;
  }).filter(Boolean).join('\n').trim();
}

async function readImage(bytes, mime) {
  const image = sharp(bytes, { limitInputPixels: maxPixels, failOn: 'warning' });
  const meta = await image.metadata();
  if (meta.format !== mimeFormats.get(mime) || !meta.width || !meta.height ||
      meta.width * meta.height > maxPixels || (meta.pages ?? 1) !== 1) throw Error();
  const prepared = await image.rotate().resize({ width: 2400, height: 3200, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: 'white' }).grayscale().normalize().png().toBuffer();
  const worker = await createWorker('por', OEM.LSTM_ONLY, { langPath: portuguese.langPath, cacheMethod: 'none' });
  try {
    const { data } = await worker.recognize(prepared);
    if (data.text.length > 16000) throw Error();
    return { method: 'ocr', text: data.text.trim() };
  } finally { await worker.terminate(); }
}

async function readPdf(bytes, preview) {
  const { getDocument, VerbosityLevel, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const images = new Set(Object.entries(OPS).filter(([name]) => /^paint(?:Inline)?Image/.test(name)).map(([, op]) => op));
  const { createCanvas } = await import('@napi-rs/canvas');
  const pdfAssets = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  const task = getDocument({
    data: new Uint8Array(bytes), verbosity: VerbosityLevel.ERRORS, stopAtErrors: true,
    useWorkerFetch: false, useSystemFonts: false, enableXfa: false, maxImageSize: maxPixels,
    canvasMaxAreaInBytes: 32_000_000,
    standardFontDataUrl: path.join(pdfAssets,'standard_fonts') + '/',
    cMapUrl: path.join(pdfAssets,'cmaps') + '/', cMapPacked: true,
    wasmUrl: path.join(pdfAssets,'wasm') + '/',
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 4 || !pdf.numPages) throw Error();
    const results = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      if (![viewport.width, viewport.height].every(n => Number.isFinite(n) && n > 0 && n <= 6000)) throw Error();
      if (preview) {
        const scaled = page.getViewport({scale:Math.min(1.5,800/viewport.width,1000/viewport.height)});
        const canvas = createCanvas(Math.ceil(scaled.width),Math.ceil(scaled.height));
        await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport:scaled}).promise;
        const jpeg = canvas.toBuffer('image/jpeg',65);
        if (jpeg.length > 400_000) throw Error();
        results.push({method:'preview',text:'',thumbnail:jpeg.toString('base64')});
        page.cleanup();
        continue;
      }
      const content = await page.getTextContent();
      const text = pdfLayoutText(content.items);
      if (text.length > 16000) throw Error();
      const nativeText = text.trim();
      const hasText = nativeText.length >= 12 && /\p{L}/u.test(nativeText);
      const mixed = hasText && (await page.getOperatorList()).fnArray.some(op => images.has(op));
      if (hasText && !mixed) {
        results.push({ method: 'text', text: text.trim() });
      } else {
        const scaled = page.getViewport({ scale: Math.min(2.5, 2400 / viewport.width, 3200 / viewport.height) });
        const canvas = createCanvas(Math.ceil(scaled.width), Math.ceil(scaled.height));
        await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: scaled }).promise;
        const reading = await readImage(canvas.toBuffer('image/png'), 'image/png');
        // Read the visible page in layout order. Appending two transcripts duplicates receipts and rows.
        results.push(mixed ? { method: 'mixed', text: reading.text || nativeText } : reading);
      }
      page.cleanup();
    }
    return results;
  } finally { await task.destroy(); }
}

try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) throw Error();
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const mime = process.argv[2];
  const pages = mime === 'application/pdf' ? await readPdf(bytes, process.argv[3] === 'preview') : [await readImage(bytes, mime)];
  process.stdout.write(JSON.stringify(pages));
} catch {
  process.exitCode = 1;
}
