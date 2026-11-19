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
    return [{ method: 'ocr', text: data.text.trim() }];
  } finally { await worker.terminate(); }
}

try {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) throw Error();
    chunks.push(chunk);
  }
  const pages = await readImage(Buffer.concat(chunks), process.argv[2]);
  process.stdout.write(JSON.stringify(pages));
} catch {
  process.exitCode = 1;
}
