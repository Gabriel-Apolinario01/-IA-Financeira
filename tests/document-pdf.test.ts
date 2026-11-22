import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { readDocument } from '../lib/document-reader';
import { documentDrafts } from '../lib/document-drafts';

test('página mista com cabeçalho digital e total em imagem produz uma única conta', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600,400]);
  page.drawText('CONTA DE ENERGIA', {x:32,y:345,size:25});
  const raster = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="200"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" font-size="40"><text x="20" y="65">Total R$ 182,34</text><text x="20" y="145">Vencimento 25/11/2026</text></g></svg>')).png().toBuffer();
  page.drawImage(await doc.embedPng(raster), {x:20,y:195,width:450,height:100});
  const pages = await readDocument(Buffer.from(await doc.save()),'application/pdf');
  assert.equal(pages[0].method,'mixed');
  const rows = documentDrafts(pages);
  assert.equal(rows.length,1);
  assert.deepEqual([rows[0].amount,rows[0].dueDate,rows[0].kind],[18234,'2026-11-25','Conta de energia']);
});

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


test('PDF digital em colunas posicionadas reconstruídas pela coordenada visual', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([620, 410]);
  const put = (value: string, x: number, y: number) => page.drawText(value, {x, y, size: 12});
  put('Extrato bancario BRL', 20, 374);
  [['Data',20],['Historico',132],['Credito',340],['Debito',428],['Saldo',524]]
    .forEach(([value,x]) => put(String(value), Number(x), 344));
  [['900,00',524],['-',428],['02/11/2026',20],['900,00',340],['Recebimento',132]]
    .forEach(([value,x]) => put(String(value), Number(x), 316));
  [['03/11/2026',20],['Padaria',132],['-',340],['20,00',428],['880,00',524]]
    .forEach(([value,x]) => put(String(value), Number(x), 288));
  const pages = await readDocument(Buffer.from(await doc.save()), 'application/pdf');
  assert.equal(pages.length, 1);
  assert.equal(pages[0].method, 'text');
  assert.match(pages[0].text, /Data\s+Historico\s+Credito\s+Debito\s+Saldo/);
  const rows = documentDrafts(pages);
  assert.deepEqual(rows.map(r => [r.date,r.amount,r.direction]), [
    ['2026-11-02',90000,'income'],['2026-11-03',2000,'expense']
  ]);
});
