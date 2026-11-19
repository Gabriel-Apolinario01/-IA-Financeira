// Private subprocess. The parent supplies bytes through stdin and enforces a wall clock limit.
import sharp from 'sharp';
import { createWorker, OEM } from 'tesseract.js';
import portuguese from '@tesseract.js-data/por';

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

async function readPdf(bytes) {
  const { getDocument, VerbosityLevel } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  const task = getDocument({
    data: new Uint8Array(bytes), verbosity: VerbosityLevel.ERRORS, stopAtErrors: true,
    useWorkerFetch: false, useSystemFonts: false, enableXfa: false, maxImageSize: maxPixels,
    canvasMaxAreaInBytes: 32_000_000,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 4 || !pdf.numPages) throw Error();
    const results = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      if (![viewport.width, viewport.height].every(n => Number.isFinite(n) && n > 0 && n <= 6000)) throw Error();
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
        if (text.length > 16000) throw Error();
      }
      if (text.trim().length >= 12 && /\p{L}/u.test(text)) {
        results.push({ method: 'text', text: text.trim() });
      } else {
        const scaled = page.getViewport({ scale: Math.min(2.5, 2400 / viewport.width, 3200 / viewport.height) });
        const canvas = createCanvas(Math.ceil(scaled.width), Math.ceil(scaled.height));
        await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: scaled }).promise;
        results.push(await readImage(canvas.toBuffer('image/png'), 'image/png'));
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
  const pages = mime === 'application/pdf' ? await readPdf(bytes) : [await readImage(bytes, mime)];
  process.stdout.write(JSON.stringify(pages));
} catch {
  process.exitCode = 1;
}
