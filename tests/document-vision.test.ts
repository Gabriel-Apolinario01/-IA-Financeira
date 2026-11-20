import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { transcribeImage } from '../lib/document-vision';
import { visionConfigured } from '../lib/document-vision-config';

test('visão exige sua própria autorização a cada foto e valida o JSON do provedor',async()=>{
  const cfg={key:'teste',model:'qwen/qwen3.8-27b',enabled:'true'};
  const bytes=await sharp({create:{width:30,height:30,channels:3,background:'white'}}).withExif({IFD0:{Artist:'Teste privado'}}).png().toBuffer();
  assert.ok((await sharp(bytes).metadata()).exif);
  let calls=0;
  const fetcher:typeof fetch=async (_url,init)=>{
    calls++;
    const body=JSON.parse(String(init?.body)); assert.equal(body.tools,undefined);assert.equal(body.model,cfg.model);
    assert.match(body.messages[1].content[0].image_url.url,/^data:image\/jpeg;base64,/);
    const sent = Buffer.from(body.messages[1].content[0].image_url.url.split(',')[1],'base64');
    assert.equal((await sharp(sent).metadata()).exif,undefined);
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'Conta de energia'})}}]});
  };
  assert.equal(visionConfigured({...cfg,model:'openai/gpt-oss-20b'}),false);
  assert.equal(visionConfigured({...cfg,model:'qualquer-modelo'}),false);
  await assert.rejects(transcribeImage(bytes,'image/png',false,cfg,fetcher));assert.equal(calls,0);
  assert.equal((await transcribeImage(bytes,'image/png',true,cfg,fetcher)).text,'Conta de energia');
  await assert.rejects(transcribeImage(bytes,'image/png',false,cfg,fetcher));assert.equal(calls,1);
  await assert.rejects(transcribeImage(bytes,'image/png',true,cfg,async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'not-json'}}]})));
  await assert.rejects(transcribeImage(bytes,'image/png',true,cfg,async()=>new Response('',{status:502})));
});
