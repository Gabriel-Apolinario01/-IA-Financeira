import test from 'node:test';
import assert from 'node:assert/strict';
import { assistImportClassification, minimizedDescription, validateClassificationRequest } from '../lib/import-assistance';

const input={consent:true,rows:[{line:2,description:'Padaria',direction:'expense'}]};
const config={enabled:'true',key:'fake-key',model:'fake-model'};
const provider=(suggestions: unknown[])=>new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({suggestions})}]}]}));
const suggestion={line:2,category:'alimentacao',nature:'expense',reason:'Possível compra em padaria; confirme.'};
test('no provider, explicit feature flag or description consent means zero external calls', async () => {
  let calls=0;const mock: typeof fetch=async()=>{calls++;throw Error('must not call');};
  for(const settings of [{},{...config,enabled:undefined},{...config,key:undefined}]) assert.equal((await assistImportClassification(input,settings,mock)).mode,'local_rules');
  assert.equal((await assistImportClassification({...input,consent:false},config,mock)).mode,'local_rules');
  assert.equal(calls,0);
});
test('provider receives only limited minimized descriptions and directions under a structured schema', async () => {
  const request={consent:true,rows:[{line:2,description:'Farmácia CPF 123.456.789-00 nome@exemplo.com https://exemplo.com',direction:'expense'}]};
  const before=JSON.stringify(request);
  const mock: typeof fetch=async(url,init)=>{
    assert.equal(String(url),'https://api.openai.com/v1/responses');
    const body=JSON.parse(String(init?.body));const payload=JSON.parse(body.input);
    assert.equal(body.store,false);assert.equal(body.max_output_tokens,1600);assert.ok(init?.signal);
    assert.equal(body.text.format.strict,true);
    assert.deepEqual(Object.keys(payload.rows[0]).sort(),['description','direction','line']);
    assert.ok(!body.input.includes('123.456.789-00'));assert.ok(!body.input.includes('nome@exemplo.com'));assert.ok(!body.input.includes('https://exemplo.com'));
    assert.ok(!body.input.includes('fake-key'));
    return provider([{...suggestion,category:'saude'}]);
  };
  const result=await assistImportClassification(request,config,mock);
  assert.equal(result.mode,'assisted');assert.equal(result.suggestions[0].suggestion.needsReview,true);
  assert.equal(result.suggestions[0].suggestion.method,'model');assert.equal(JSON.stringify(request),before);
  assert.match(minimizedDescription('CPF 12345678901'),/removido/);
});
test('timeouts, provider errors and malformed responses fall back to local classification', async () => {
  const mocks: Array<typeof fetch>=[async()=>{throw new DOMException('Timeout','TimeoutError');},async()=>new Response('',{status:503}),async()=>new Response('invalid JSON'),async()=>new Response('x'.repeat(32001))];
  for(const mock of mocks) {const result=await assistImportClassification(input,config,mock);assert.equal(result.mode,'local_rules');assert.equal(result.suggestions[0].suggestion.category,'alimentacao');}
});
test('invalid provider fields, categories, nature, row IDs and uncalibrated probabilities are rejected', async () => {
  for(const patch of [{category:'invented'},{nature:'fake'},{line:99},{ownerId:'other'},{confidence:0.99},{refundOf:'original'},{reason:'x'.repeat(241)}]) {
    const result=await assistImportClassification(input,config,async()=>provider([{...suggestion,...patch}]));
    assert.equal(result.mode,'local_rules');
  }
});
test('model cannot override conservative local transfer, invoice, refund or intermediary signals', async () => {
  for(const description of ['Transferência recebida','Pagamento de fatura','Estorno farmácia','Mercado Pago']) {
    const local=await assistImportClassification({...input,rows:[{...input.rows[0],description}]},{enabled:'false'});
    const result=await assistImportClassification({...input,rows:[{...input.rows[0],description}]},config,async()=>provider([suggestion]));
    assert.deepEqual(result.suggestions,local.suggestions);
  }
  const result=await assistImportClassification(input,config,async()=>provider([{...suggestion,category:'apostas'}]));
  assert.equal(result.suggestions[0].suggestion.category,'alimentacao');
});
test('malicious classification request fields and excessive rows never reach provider', async () => {
  for(const request of [{...input,ownerId:'other'},{...input,consent:'yes'},{...input,rows:Array(11).fill(input.rows[0])},{...input,rows:[{...input.rows[0],amount:999}]},{...input,rows:[input.rows[0],input.rows[0]]},{...input,rows:[{...input.rows[0],description:'x'.repeat(161)}]}]) assert.throws(()=>validateClassificationRequest(request));
});
