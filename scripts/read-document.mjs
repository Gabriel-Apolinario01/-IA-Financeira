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
      let text = '';
      for (const item of content.items) {
        if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
        if (text.length > 16000) throw Error();
      }
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
