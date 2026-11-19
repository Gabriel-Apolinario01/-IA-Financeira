import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { readDocument } from '../lib/document-reader';

test('PDF com página digital e página escaneada identifica a origem do texto de cada uma', async () => {
  const document = await PDFDocument.create();
  const digital = document.addPage([600, 400]);
  digital.drawText('Boleto de teste\nValor R$ 1.234,56\nVencimento 25/11/2026', { x: 20, y: 340, size: 19 });
  const receipt = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="350"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" font-size="40"><text x="30" y="85">COMPROVANTE PIX</text><text x="30" y="170">Valor pago R$ 71,98</text></g></svg>');
  const jpeg = await document.embedJpg(await sharp(receipt).jpeg().toBuffer());
  document.addPage([450, 175]).drawImage(jpeg, { x: 0, y: 0, width: 450, height: 175 });
  const pages = await readDocument(Buffer.from(await document.save()), 'application/pdf');
  assert.equal(pages.length, 2);
  assert.equal(pages[0].method, 'text');
  assert.match(pages[0].text, /1\.234,56/);
  assert.equal(pages[1].method, 'ocr');
  assert.match(pages[1].text, /71,98/);
});

test('recusa PDF acima do limite de páginas antes de ler seu conteúdo', async () => {
  const document = await PDFDocument.create();
  for (let i = 0; i < 5; i++) document.addPage();
  await assert.rejects(readDocument(Buffer.from(await document.save()), 'application/pdf'), /limites/);
});
