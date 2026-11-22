// Local-only end-to-end checks. Creates a disposable database and synthetic accounts;
// never uses a production URL or external AI. Run: node scripts/verify-tour-browser.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { chromium } from 'playwright-core';
import { PDFDocument } from 'pdf-lib';

const output = path.resolve('outputs/tour');
await mkdir(output, { recursive: true });
const port = 5190;
const base = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString('hex');
const databaseDir = path.resolve('.test-data', `tour-${randomUUID()}`);
const cluster = new EmbeddedPostgres({ databaseDir, port: 55449, user: 'postgres', password,
  persistent: true, authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1'],
  autoRehydrateSymlinks: true, onLog: () => {}, onError: () => {} });
const env = { ...process.env, AZURE_AUTH_MODE: 'email', AZURE_POSTGRES_SSL: 'false',
  AZURE_POSTGRES_CONNECTION_STRING: `postgresql://postgres:${password}@127.0.0.1:55449/postgres`,
  BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), BETTER_AUTH_URL: base,
  AI_ENABLED: 'false', GROQ_API_KEY: '', OPENAI_API_KEY: '', DOCUMENT_VISION_ENABLED: 'false' };
const result = [];
let server, browser, started = false;
let logs = '';
const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => { logs += d; }); child.stderr.on('data', d => { logs += d; });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`Command failed: ${args[0]}`)));
});
try {
  await cluster.initialise(); await cluster.start(); started = true;
  await run(['scripts/prepare-azure-db.mjs']);
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...(process.argv.includes('--production') ? ['start'] : ['dev', '--webpack']), '--hostname', '127.0.0.1', '--port', String(port)], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Server did not start')), 60000);
    server.stdout.on('data', d => { logs += d; if (d.toString().includes('Ready')) { clearTimeout(timeout); resolve(); } });
    server.stderr.on('data', d => { logs += d; });
    server.on('error', reject); server.on('exit', c => { clearTimeout(timeout); reject(Error('Server exited '+c)); });
  });
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true, args: ['--no-proxy-server'] });
  const pdf = await PDFDocument.create();
  pdf.addPage([560,350]).drawText('Cupom fiscal\nEstabelecimento: Mercado Exemplo\nValor pago R$ 20,00\nPago em 19/11/2026', { x: 30, y: 280 });
  const receipt = Buffer.from(await pdf.save());
  for (const [device, width, height] of [['desktop',1440,1000],['mobile',390,844]]) {
    for (const mode of ['demo','account']) {
      console.log(`Checking ${device}/${mode}`);
      const context = await browser.newContext({ viewport: { width,height }, locale: 'pt-BR', reducedMotion: 'reduce' });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      const errors = [], mutations = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', r => { if (r.method() !== 'GET' && /\/api\/(command|chat|diagnosis|document|import-classification|account)/.test(r.url())) mutations.push(r.url()); });
      const snap = async name => page.screenshot({ path: path.join(output, `${device}-${mode}-${name}.png`), animations: 'disabled' });
      const button = name => page.getByRole('button', { name, exact: true });
      const pop = page.locator('.driver-popover');
      const open = async name => { await button('Precisa de uma mão?').click(); await button(name).click(); };
      const title = async text => { await page.locator('.driver-popover-title').filter({ hasText: text }).waitFor(); };
      const next = async () => page.locator('.driver-popover-next-btn').click();
      const inViewport = async () => {
        const box = await pop.boundingBox(); assert.ok(box, 'popover visible');
        const viewport = page.viewportSize();
        assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, JSON.stringify({ box, viewport }));
      };
      const state = async () => mode === 'account' ? (await context.request.get(base+'/api/state')).json() : page.evaluate(() => localStorage.getItem('ia-financeira:demo:v1'));
      try {
        if (mode === 'account') {
          const response = await context.request.post(base+'/api/auth/sign-up/email', { headers: { origin: base }, data: { name: 'Pessoa fictícia', email: `tour-${randomUUID()}@example.test`, password: 'Test-only-passphrase-42!' } });
          assert.equal(response.status(), 200, await response.text());
        }
        await page.goto(`${base}/?mode=${mode}`, { waitUntil: 'networkidle', timeout: 60000 });
        await page.locator('.tour-invite').waitFor(); assert.equal(await pop.count(), 0);
        await snap('convite'); await page.locator('.tour-invite').getByRole('button', { name: 'Agora não', exact: true }).click();
        await page.reload({ waitUntil: 'networkidle' }); assert.equal(await page.locator('.tour-invite').count(), 0);
        const initial = await state();
        await open('Fazer tour pelo site'); await title('Um passo de cada vez'); await inViewport();
        await snap('inicio'); await next(); await title('Entenda o resultado'); await inViewport();
        await page.locator('.driver-popover-prev-btn').click(); await title('Um passo de cada vez');
        await next(); await next(); await title('Organize seus lançamentos');
        // The spotlight follows the visible navigation after a viewport change.
        if (device === 'desktop') {
          await page.setViewportSize({ width: 390, height: 844 });
          await page.waitForFunction(() => document.querySelector('.mobile-nav [data-tour="nav-transactions"]')?.classList.contains('driver-active-element'));
          await inViewport();
          await page.setViewportSize({ width,height });
          await page.waitForFunction(() => document.querySelector('.sidebar [data-tour="nav-transactions"]')?.classList.contains('driver-active-element'));
        }
        for (const heading of ['Adicione um lançamento','Extrato, foto ou PDF','Encontre e confira','Explore possibilidades','Dê um nome','Conheça os recursos educativos','Aprender e conversar','Seu chat financeiro','Pronto para explorar']) {
          await next(); await title(heading); await inViewport();
          if (['Extrato, foto ou PDF','Seu chat financeiro'].includes(heading)) await snap(heading.startsWith('Extrato') ? 'upload' : 'chat');
        }
        assert.equal(await page.locator('.financial-chat input[type="checkbox"]:checked').count(), 0);
        await button('Rever tour').click(); await title('Um passo de cada vez');
        await page.keyboard.press('Escape'); await pop.waitFor({ state: 'hidden' });
        assert.equal(await button('Precisa de uma mão?').evaluate(el => el === document.activeElement), true);
        await open('Fazer tour pelo site'); await title('Um passo de cada vez');
        await page.keyboard.press('Tab'); assert.ok(await pop.evaluate(el => el.contains(document.activeElement)), 'keyboard focus stays in tour');
        await page.keyboard.press('Escape');
        // Reopen from a different view and finish through the explicit final button.
        await open('Fazer tour pelo site');
        for (let i=0; i<11; i++) { await next(); await page.waitForFunction(n => document.querySelector('.driver-popover-progress-text')?.textContent === `${n} de 12`, i+2); }
        await next(); await pop.waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => localStorage.getItem('ia-financeira:onboarding-tour:v1')), 'completed');
        await page.locator('[data-tour="nav-transactions"]:visible').click();
        await button('Como importar e revisar um documento?').click(); await title('Como importar'); await inViewport();
        await next(); await title('Continue quando'); await next(); await pop.waitFor({ state: 'hidden' });
        if (mode === 'account') {
          await page.getByLabel('Extrato, foto ou PDF',{ exact: true }).setInputFiles({ name: 'ficticio.pdf', mimeType: 'application/pdf', buffer: receipt });
          await page.locator('[data-tour="document-extract"]').waitFor();
          await button('Como importar e revisar um documento?').click(); await title('Como importar'); await next(); await title('Peça a leitura'); await inViewport(); await next();
          await pop.waitFor({ state: 'hidden' });
          // Only this explicit test action extracts. The tour itself must send nothing.
          assert.deepEqual(mutations, []);
          const extraction = page.waitForResponse(r => r.url() === base+'/api/document');
          await button('Extrair dados').click(); assert.equal((await extraction).status(),200);
          await page.locator('[data-tour="document-fields"]').first().waitFor(); mutations.length = 0;
          const draftBefore = await page.locator('.document-panel').evaluate(el => Array.from(el.querySelectorAll('input,select')).map(i=>[i.value,i.checked]));
          await button('Como importar e revisar um documento?').click();
          for (const heading of ['Peça a leitura','Confira cada campo','Escolha os lançamentos','Confirme quando']) { await next(); await title(heading); await inViewport(); if (heading === 'Confira cada campo') await snap('revisao'); }
          await next(); await pop.waitFor({ state:'hidden' });
          assert.deepEqual(await page.locator('.document-panel').evaluate(el=>Array.from(el.querySelectorAll('input,select')).map(i=>[i.value,i.checked])), draftBefore);
          await open('Fazer tour pelo site');
          await page.getByRole('status').filter({ hasText: 'Conclua a revisão' }).waitFor(); assert.equal(await pop.count(),0);
        }
        assert.deepEqual(await state(), initial, 'No financial records or preferences changed');
        assert.deepEqual(mutations, [], 'No mutation / AI requests from tours'); assert.deepEqual(errors, []);
        await open('Ver guias educativos'); await page.locator('.education-grid').waitFor();
        for (const area of ['overview','savings','goals','learn']) {
          await page.locator(`[data-tour="nav-${area}"]:visible`).click();
          await open('Ajuda desta tela'); await pop.waitFor(); await inViewport();
          await page.keyboard.press('Escape'); await pop.waitFor({state:'hidden'});
        }
        assert.deepEqual(await state(), initial); assert.deepEqual(mutations, []);
        result.push({ device, mode, status:'passed' });
      } catch (error) { console.error(error); await snap('failure'); throw error; }
      finally { await context.close(); }
    }
  }
  const restricted = await browser.newContext({ viewport: {width:320,height:568} });
  await restricted.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) { if (key === 'ia-financeira:onboarding-tour:v1') throw new DOMException('Unavailable','SecurityError'); return get.call(this,key); };
    Storage.prototype.setItem = function(key,value) { if (key === 'ia-financeira:onboarding-tour:v1') throw new DOMException('Unavailable','SecurityError'); return set.call(this,key,value); };
  });
  const small = await restricted.newPage();
  await small.goto(base+'/?mode=demo',{waitUntil:'networkidle'});
  await small.getByRole('button',{name:'Fazer tour',exact:true}).click();
  await small.locator('.driver-popover').waitFor();
  await small.locator('.driver-popover-next-btn').click();
  await small.locator('.driver-popover-title').filter({hasText:'Entenda o resultado'}).waitFor();
  const bounds = await small.locator('.driver-popover').boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 321 && bounds.y + bounds.height <= 569);
  await small.keyboard.press('Escape'); await small.locator('.driver-popover').waitFor({state:'hidden'});
  await restricted.close();
  result.push({device:'small-mobile',mode:'demo',storage:'unavailable',status:'passed'});
  await writeFile(path.join(output,'results.json'), JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    if (process.platform === 'win32') await new Promise(resolve => spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide:true, stdio:'ignore' }).once('exit',resolve));
    else server.kill('SIGTERM');
  }
  server?.stdout?.destroy(); server?.stderr?.destroy(); server?.unref();
  if (started) {
    if (process.platform === 'win32') {
      // Native PostgreSQL shutdown also works in Windows sandboxes that cannot
      // enumerate processes for taskkill. This cluster belongs only to this run.
      await run(['scripts/stop-tour-postgres.mjs', databaseDir]);
      cluster.process?.stdin?.destroy(); cluster.process?.stdout?.destroy(); cluster.process?.stderr?.destroy(); cluster.process?.unref();
      cluster.process = undefined;
    } else await cluster.stop();
  }
  await writeFile(path.join(output,'server.log'),logs);
}
