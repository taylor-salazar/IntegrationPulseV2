const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {harness,json,ROOT}=require('./helpers.cjs');
const config={production:true,useMock:false,liveMode:'proxy',backendBaseUrl:'.',payloadBaseUrl:'./payload-api/v1'};
function client(fetch,search='') {
  const h=harness({search,fetch,overrides:{'integrationpulse/service/config':config}});
  return {h,c:h.load('webapp/service/BackendClient.js')};
}

test('production ignores URL mode switches and Viewer makes no payload request',async()=>{
  const {h,c}=client(()=>json({capabilities:{viewIntegrations:true,administer:false,readPayloads:false}}),'?mock=true&api=destination');
  assert.equal(c.isMock(),false);assert.equal(c.getLiveMode(),'proxy');
  await c.getSession(); assert.deepEqual(JSON.parse(JSON.stringify(await c.getPayloads('id'))),[]);
  await assert.rejects(c.updateConfigurations('id',[{key:'a',value:'b',action:'set'}]),/Administrator/);
  assert.equal(h.calls.length,1);
});

test('CSRF cache refresh retries only explicit router rejection, never ambiguous trigger failure',async()=>{
  let csrf=0,writes=0;
  const {h,c}=client((url,options)=>{
    if(options.headers?.['X-CSRF-Token']==='Fetch')return new Response('',{headers:{'x-csrf-token':'token-'+(++csrf)}});
    if(url.endsWith('/api/session'))return json({capabilities:{administer:true,readPayloads:true}});
    writes++;if(writes===1)return new Response('',{status:403,headers:{'x-csrf-token':'Required'}});
    return json({updated:1});
  });
  await c.getSession();await c.updateConfigurations('id',[{key:'a',value:'b',action:'set'}]);
  assert.equal(writes,2);assert.equal(csrf,2);
  assert.equal(h.calls.at(-1).headers['X-CSRF-Token'],'token-2');
  let attempts=0;
  const second=client((url,options)=>{
    if(options.headers?.['X-CSRF-Token']==='Fetch')return new Response('',{headers:{'x-csrf-token':'token'}});
    if(url.endsWith('/api/session'))return json({capabilities:{administer:true}});
    attempts++;throw new Error('ambiguous network failure');
  });
  await second.c.getSession();await assert.rejects(second.c.triggerImmediateRun({id:'id'},{endpoint:'/run'}),/ambiguous/);
  assert.equal(attempts,1);
});

test('production router exposes only application APIs, keeps CSRF and authenticated static content',()=>{
  const routes=JSON.parse(fs.readFileSync(path.join(ROOT,'webapp/xs-app.json'))).routes;
  assert.ok(routes.every(r=>r.authenticationType==='xsuaa'));
  assert.ok(routes.filter(r=>r.destination).every(r=>r.destination==='pulse-api' && r.csrfProtection));
  assert.ok(!routes.some(r=>r.source.includes('/http/') || r.destination?.includes('Integration-Suite')));
  for(const name of ['IntegrationDetail','MonitoringDetail']){
    const text=fs.readFileSync(path.join(ROOT,`webapp/controller/${name}.controller.js`),'utf8');
    assert.ok(!text.includes('window.open(BackendClient.getPayloadDownloadUrl'));
    assert.ok(text.includes('BackendClient.downloadPayload'));
  }
});

test('payload download fetches authenticated bytes, honors filename and handles denial',async()=>{
  let clicked=0,removed=0,revoked=0,blob,deny=false;
  const anchor={click(){clicked++;},remove(){removed++;}};
  class BlobURL extends URL {
    static createObjectURL(value){blob=value;return 'blob:synthetic';}
    static revokeObjectURL(value){assert.equal(value,'blob:synthetic');revoked++;}
  }
  const h=harness({immediateTimers:true,overrides:{'integrationpulse/service/config':config},globals:{
    URL:BlobURL,document:{createElement:()=>anchor,body:{appendChild(){}}}
  },fetch:url=>url.endsWith('/api/session')?json({capabilities:{readPayloads:true,administer:true}}):
    new Response('payload bytes',{status:deny?403:200,headers:{'content-disposition':"attachment; filename*=UTF-8''report%20one.json"}})});
  const c=h.load('webapp/service/BackendClient.js');await c.getSession();await c.downloadPayload('id');
  assert.equal(await blob.text(),'payload bytes');assert.equal(anchor.download,'report one.json');
  assert.equal(clicked,1);assert.equal(removed,1);assert.equal(revoked,1);
  assert.equal(h.calls.at(-1).credentials,'include');assert.equal(h.calls.at(-1).cache,'no-store');
  assert.equal(h.calls.at(-1).url,'./payload-api/v1/payloads/id/download');
  deny=true;await assert.rejects(c.downloadPayload('id'),/HTTP 403/);assert.equal(clicked,1);
});
