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
const verifyGroq = process.argv.includes('--groq-free-test');
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
  const devices = verifyGroq ? [['desktop',1360,960]] : [['desktop',1360,960],['celular',390,844]];
  for (const [device,width,height] of devices) {
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
      const importer=page.getByRole('region',{name:'Importar extrato'});
      const picker=importer.getByLabel('Extrato, foto ou PDF',{exact:true});
      const panel=importer.locator('.document-panel');
      await picker.setInputFiles({name:'extrato.csv',mimeType:'text/csv',buffer:Buffer.from('data;descricao;valor\n2026-11-19;Mercado;-10,00')});
      await importer.getByRole('table').waitFor();
      const upload=async (name,mimeType,buffer) => {
        await picker.setInputFiles({name,mimeType,buffer});
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
      const snapshot = async () => (await (await context.request.get(base+'/api/state')).json()).state.transactions;
      const beforeSelection = await snapshot();
      await button('Selecionar todos os válidos').focus();
      await page.keyboard.press('Enter');
      await panel.getByText('1 de 1 lançamentos selecionados',{exact:false}).waitFor();
      await button('Desmarcar todos').click();
      assert.equal(await panel.getByLabel('Selecionar lançamento 1').isChecked(),false);
      await button('Selecionar todos os válidos').click();
      await panel.getByLabel('Valor em reais').fill('0');
      assert.equal(await panel.getByLabel('Selecionar lançamento 1').isChecked(),false);
      await panel.getByLabel('Valor em reais').fill('182,34');
      assert.equal(await panel.getByLabel('Selecionar lançamento 1').isChecked(),false);
      await button('Selecionar todos os válidos').click();
      assert.deepEqual(await snapshot(),beforeSelection);
      await screenshot('revisao',panel.locator('.document-review'));
      await button('Confirmar e adicionar (1)').click();
      await panel.getByText('Já adicionado a partir deste documento.').waitFor();
      await page.locator('.records-card').getByText('Energia revisada',{exact:true}).waitFor();
      await screenshot('lancamento',page.locator('.records-card'));
      const again=await upload('reenvio.jpg','image/jpeg',jpeg);assert.equal(again.hash,energy.hash);
      await panel.getByText('Já adicionado a partir deste documento.').waitFor();
      // Some file managers omit the MIME type when a PDF is dropped.
      await importer.locator('.import-drop').evaluate((zone,bytes)=>{
        const transfer=new DataTransfer();
        transfer.items.add(new File([new Uint8Array(bytes)],'cupom.PDF'));
        zone.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
      },Array.from(pdf));
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
      if (verifyGroq) await page.getByLabel(/Autorizar a Groq a receber/).check();
      await page.getByLabel(/Usar os totais do mês/).check();
      const getSnapshot=async () => {
        const response=await context.request.get(base+'/api/state');assert.equal(response.status(),200);
        const {state,revision,generation}=await response.json();
        return {state,revision,generation};
      };
      const beforeChat=await getSnapshot();
      const calls=[];
      let requests=0;
      await page.route('**/api/chat',async route=>{
        if (++requests>2) return route.abort();
        return route.continue();
      });
      const ask=async (text,index) => {
        const reply=page.waitForResponse(r=>r.url()===base+'/api/chat',{timeout:25_000});
        await page.getByLabel('Sua pergunta',{exact:true}).fill(text);
        await page.getByLabel('Sua pergunta',{exact:true}).press('Enter');
        const response=await reply;
        assert.equal(response.status(),200);
        const answer=await response.json();
        await page.locator('.chat-turn').nth(index).waitFor();
        const displayed=await page.locator('.chat-turn').nth(index).innerText();
        calls.push({question:text,http:response.status(),mode:answer.mode,paragraphs:answer.paragraphs,facts:answer.facts,displayed});
        await writeFile(path.join(output,device+'-respostas.json'),JSON.stringify(calls,null,2));
        assert.equal(answer.mode,verifyGroq?'groq':'local');
        for(const p of [...answer.paragraphs,...answer.facts]) assert.ok(displayed.replaceAll('\u00a0',' ').includes(p.replaceAll('\u00a0',' ')));
        assert.ok(answer.facts.some(f=>/Moradia.*182,34/i.test(f)));
        return answer;
      };
      await ask('Quero reduzir a conta de energia. Quanto gastei em moradia?',0);
      const followup=await ask(verifyGroq?'Qual despesa eu mencionei antes e o que posso fazer para reduzi-la?':'E como posso diminuir esses gastos?',1);
      if (verifyGroq) assert.match(followup.paragraphs.join(' '),/energia|el[eé]tric|conta de luz/i);
      assert.equal(requests,2);
      assert.deepEqual(await getSnapshot(),beforeChat);
      assert.match(await page.locator('.chat-turn').nth(1).innerText(),/Moradia/i);
      await screenshot('chat',page.locator('.financial-chat'));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= document.documentElement.clientWidth+1));
      await button('Configurações').click();await button('Sair da conta').click();
      await page.waitForURL(base+'/',{waitUntil:'domcontentloaded'});
      await page.goto(base+'/login');
      await page.getByLabel('Seu e-mail').fill(email);await page.getByLabel('Senha',{exact:true}).fill(password);
      await button('Entrar').click();await page.locator('.summary-number').filter({hasText:/202,34/}).waitFor();
      results.push({device,width,height,ocr:energy.pages[0].method,pdf:receipt.pages[0].method,scannedPdf:scanned.pages[0].method,confirmed:2,expenseCents:20234,chat:verifyGroq?'groq':'local',questions:requests,financialStateUnchangedByChat:true,loginAgain:true});
      console.log(device+' aprovado');
    } catch(error) {
      await screenshot('falha');
      console.error('Etapa interrompida em '+device+' '+page.url());
      throw error;
    } finally {await context.close();}
  }
  await writeFile(path.join(output,'navegador.json'),JSON.stringify(results,null,2));
} finally {await browser.close();}
