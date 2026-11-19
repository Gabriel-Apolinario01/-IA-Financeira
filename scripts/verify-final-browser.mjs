// Exercise the local email-authenticated application with synthetic accounts only.
import { chromium } from 'playwright-core';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = 'http://localhost:5174';
const output = path.resolve(process.argv[2] || 'outputs/entrega-final');
await mkdir(output,{recursive:true});
const jpeg = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" fill="black"><text x="55" y="80" font-size="40">CONTA DE ENERGIA</text><text x="55" y="160" font-size="32">Emissor: Luz Exemplo</text><text x="55" y="235" font-size="32">Total R$ 182,34</text><text x="55" y="310" font-size="32">Vencimento 25/11/2026</text><text x="55" y="410" font-size="22">DOCUMENTO FICTICIO PARA TESTES</text></g></svg>')).jpeg().toBuffer();
await writeFile(path.join(output,'conta-sintetica.jpg'),jpeg);
const document=await PDFDocument.create();
document.addPage([560,350]).drawText('Cupom fiscal\nEstabelecimento: Mercado Exemplo\nValor pago R$ 20,00\nPago em 19/11/2026',{x:30,y:280});
const pdf=Buffer.from(await document.save());
await writeFile(path.join(output,'cupom-sintetico.pdf'),pdf);
const scanDocument=await PDFDocument.create();
const raster=await scanDocument.embedJpg(jpeg);
scanDocument.addPage([500,250]).drawImage(raster,{x:0,y:0,width:500,height:250});
const scan=Buffer.from(await scanDocument.save());
await writeFile(path.join(output,'conta-digitalizada.pdf'),scan);
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge',headless:true});
const results=[];
try {
  for (const [device,width,height] of [['desktop',1360,960],['celular',390,844]]) {
    const context=await browser.newContext({viewport:{width,height},locale:'pt-BR',isMobile:device==='celular',hasTouch:device==='celular'});
    const page=await context.newPage();
    page.setDefaultTimeout(15_000);
    const button = name => page.getByRole('button',{name,exact:true});
    const screenshot = async (name,locator) => {
      const options={path:path.join(output,device+'-'+name+'.png'),animations:'disabled'};
      if (locator) await locator.screenshot(options); else await page.screenshot(options);
    };
    const password=randomUUID()+'a!'; const email='entrega-'+randomUUID()+'@example.test';
    try {
      await page.goto(base+'/login');
      await button('Ainda não tenho conta — cadastrar').click();
      await page.getByLabel('Seu nome').fill('Pessoa de teste');
      await page.getByLabel('Seu e-mail').fill(email);
      await page.getByLabel('Senha',{exact:true}).fill(password);
      await page.getByLabel('Confirme a senha').fill(password);
      await button('Criar conta').click();
      await button('Lançamentos').click();
      await button('Adicionar por foto ou PDF').click();
      const panel=page.locator('.document-panel');
      const upload=async (name,mimeType,buffer) => {
        await panel.getByLabel('Selecionar foto ou PDF').setInputFiles({name,mimeType,buffer});
        const reading = page.waitForResponse(r=>r.url()===base+'/api/document',{timeout:60_000});
        await button('Extrair dados').click();
        const response=await reading;
        assert.equal(response.status(),200);
        return response.json();
      };
      const energy=await upload('energia.jpg','image/jpeg',jpeg);
      assert.equal(energy.rows[0].amount,18234);assert.equal(energy.rows[0].status,'planned');
      await writeFile(path.join(output,device+'-extracao.json'),JSON.stringify(energy,null,2));
      await panel.getByLabel('Descrição',{exact:true}).fill('Energia revisada');
      await panel.getByLabel('Situação').selectOption('realized');
      const current = new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
      await panel.getByLabel('Data do lançamento').fill(current);
      await panel.getByLabel('Selecionar lançamento 1').check();
      await screenshot('revisao',panel.locator('.document-review'));
      await button('Confirmar e adicionar (1)').click();
      await panel.getByText('Já adicionado a partir deste documento.').waitFor();
      await page.locator('.records-card').getByText('Energia revisada',{exact:true}).waitFor();
      await screenshot('lancamento',page.locator('.records-card'));
      const again=await upload('reenvio.jpg','image/jpeg',jpeg);assert.equal(again.hash,energy.hash);
      await panel.getByText('Já adicionado a partir deste documento.').waitFor();
      await panel.getByLabel('Selecionar foto ou PDF').setInputFiles({name:'cupom.pdf',mimeType:'application/pdf',buffer:pdf});
      await button('Visualizar PDF').click();
      await panel.getByRole('img',{name:'Página 1 do documento'}).waitFor();
      await screenshot('pdf',panel.getByRole('img',{name:'Página 1 do documento'}));
      const receipt=await upload('cupom.pdf','application/pdf',pdf);assert.equal(receipt.pages[0].method,'text');
      await panel.getByLabel('Data do lançamento').fill(current);
      await panel.getByLabel('Selecionar lançamento 1').check();await button('Confirmar e adicionar (1)').click();
      await panel.getByText('Já adicionado a partir deste documento.').waitFor();
      const scanned=await upload('conta-digitalizada.pdf','application/pdf',scan);
      assert.equal(scanned.pages[0].method,'ocr');assert.equal(scanned.rows[0].amount,18234);
      await writeFile(path.join(output,device+'-pdf-digitalizado.json'),JSON.stringify(scanned,null,2));
      await button('Visão geral').click();await page.reload();
      await page.locator('.summary-number').filter({hasText:/202,34/}).waitFor();
      await screenshot('dashboard');
      await button('Aprender').click();await page.getByRole('tab',{name:'Chat financeiro'}).click();
      await page.getByLabel(/Usar os totais do mês/).check();
      const ask=async (text,index) => {
        await page.getByLabel('Sua pergunta',{exact:true}).fill(text);
        await page.getByLabel('Sua pergunta',{exact:true}).press('Enter');
        await page.locator('.chat-turn').nth(index).waitFor();
      };
      await ask('Quanto gastei em moradia?',0);await ask('E como posso diminuir esses gastos?',1);
      assert.match(await page.locator('.chat-turn').nth(1).innerText(),/Moradia/i);
      await screenshot('chat',page.locator('.financial-chat'));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= document.documentElement.clientWidth+1));
      await button('Configurações').click();await button('Sair da conta').click();
      await page.waitForURL(base+'/',{waitUntil:'domcontentloaded'});
      await page.goto(base+'/login');
      await page.getByLabel('Seu e-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);
      await button('Entrar').click();await page.locator('.summary-number').filter({hasText:/202,34/}).waitFor();
      results.push({device,width,height,ocr:energy.pages[0].method,pdf:receipt.pages[0].method,confirmed:2,expenseCents:20234,chat:'local',questions:2,loginAgain:true});
      console.log(device+' aprovado');
    } catch(error) {
      await screenshot('falha');
      console.error('Etapa interrompida em '+device+' '+page.url());
      throw error;
    } finally {await context.close();}
  }
  await writeFile(path.join(output,'navegador.json'),JSON.stringify(results,null,2));
} finally {await browser.close();}
