import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readDocument } from '../lib/document-reader';

// Synthetic, raster-only sources. OCR never receives their text as metadata.
const examples = [
  { mime: 'image/jpeg', format: 'jpeg', lines: ['CONTA DE ENERGIA', 'Valor total R$ 182,34', 'Vencimento 25/11/2026'], amount: '182,34' },
  { mime: 'image/png', format: 'png', lines: ['CUPOM FISCAL', 'Mercado Exemplo', 'Total R$ 1.234,56'], amount: '1.234,56' },
  { mime: 'image/webp', format: 'webp', lines: ['COMPROVANTE PIX', 'Pagamento realizado', 'Valor R$ 72,19'], amount: '72,19' },
] as const;

for (const example of examples) {
  test('OCR em português lê pixels de ' + example.format, async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="350"><rect width="100%" height="100%" fill="white"/>' +
      example.lines.map((line, i) => '<text font-family="Arial" font-size="38" x="40" y="' + (75 + i * 80) + '">' + line + '</text>').join('') + '</svg>';
    const bytes = await sharp(Buffer.from(svg)).toFormat(example.format).toBuffer();
    const [page] = await readDocument(bytes, example.mime);
    assert.equal(page.method, 'ocr');
    assert.ok(page.text.includes(example.amount), page.text);
    assert.ok(page.text.toUpperCase().includes(example.lines[0]));
  });
}

test('recusa assinatura trocada e arquivo truncado', async () => {
  await assert.rejects(readDocument(Buffer.from('%PDF-'), 'image/png'), /assinatura/);
  await assert.rejects(readDocument(Buffer.from('ffd8ff', 'hex'), 'image/jpeg'), /ler o documento/);
});
test('foto em branco passa pelo OCR sem produzir dados inventados',async()=>{
  const blank=await sharp({create:{width:600,height:300,channels:3,background:'white'}}).png().toBuffer();
  const [page]=await readDocument(blank,'image/png');
  assert.equal(page.method,'ocr');assert.equal(page.text,'');
});
