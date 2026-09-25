const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,json,odata}=require('./helpers.cjs');
const cases=require('../fixtures/identity-parity.json');

for (const fixture of cases) {
  test('shared canonical identity: '+fixture.name,async()=>{
    let selected;
    const h=harness({fetch:url=>{
      const parsed=new URL(url,'https://local.test');
      if(parsed.searchParams.has('$filter')) return odata(parsed.searchParams.get('$filter').startsWith('PackageId')?fixture.package:[]);
      const path=decodeURIComponent(parsed.pathname);
      const match=/Id='((?:''|[^'])*)',Version='((?:''|[^'])*)'/.exec(path);
      if(match){
        const [id,version]=match.slice(1).map(s=>s.replaceAll("''","'"));
        if(path.endsWith('/Configurations')){selected={id,version};return odata([]);}
        const entry=fixture.direct.find(e=>e.id===id&&e.requested===version);
        if(entry)return entry.status?new Response(String(entry.status),{status:entry.status}):json({d:entry});
      }
      return new Response('not found',{status:404});
    }});
    const result=h.load('webapp/service/BackendClient.js').getConfigurations(fixture.item.id,fixture.item);
    if(fixture.error)await assert.rejects(result,new RegExp(fixture.error));
    else {await result;assert.deepEqual(selected,fixture.expected);}
  });
}
