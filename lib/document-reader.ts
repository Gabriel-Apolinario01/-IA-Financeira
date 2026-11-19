import { spawn } from 'node:child_process';
import path from 'node:path';

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export interface DocumentPage { method: 'text' | 'ocr'; text: string }
let active = 0;

export function documentSignature(bytes: Buffer, mime: string) {
  if (mime === 'application/pdf') return bytes.subarray(0, 5).equals(Buffer.from('%PDF-'));
  if (mime === 'image/jpeg') return bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (mime === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

export async function readDocument(bytes: Buffer, mime: string): Promise<DocumentPage[]> {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES || !documentSignature(bytes, mime))
    throw new Error('Formato, assinatura ou tamanho do documento inválido.');
  if (active >= 2) throw new Error('Leitor ocupado. Aguarde e tente novamente.');
  active++;
  try {
    return await new Promise<DocumentPage[]>((resolve, reject) => {
      const reader = spawn(process.execPath, ['--max-old-space-size=256', path.resolve('scripts/read-document.mjs'), mime], {
        stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
        env: { NODE_ENV: 'production', ...Object.fromEntries(['SystemRoot', 'PATH', 'TEMP', 'TMP', 'TMPDIR', 'LANG'].flatMap(key =>
          process.env[key] ? [[key, process.env[key]!]] : [])) },
      });
      const timer = setTimeout(() => reader.kill('SIGKILL'), 45_000);
      const output: Buffer[] = [];
      let size = 0;
      reader.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 256_000) reader.kill('SIGKILL');
        else output.push(chunk);
      });
      reader.on('error', () => { clearTimeout(timer); reject(new Error('Leitor indisponível.')); });
      reader.on('close', code => {
        clearTimeout(timer);
        try {
          if (code !== 0 || size > 256_000) throw Error();
          const pages = JSON.parse(Buffer.concat(output).toString('utf8'));
          if (!Array.isArray(pages) || pages.length < 1 || pages.length > 4 ||
              !pages.every(page => page && ['ocr', 'text'].includes(page.method) &&
                typeof page.text === 'string' && page.text.length <= 16000)) throw Error();
          resolve(pages);
        } catch { reject(new Error('Não foi possível ler o documento dentro dos limites.')); }
      });
      reader.stdin.on('error', () => reader.kill());
      reader.stdin.end(bytes);
    });
  } finally { active--; }
}
