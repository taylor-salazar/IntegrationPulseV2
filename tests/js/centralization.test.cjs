const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, plain} = require('./helpers.cjs');

test('only explicit edits are saved; masked, redacted and default values never replace secrets', () => {
  const {instance:d, models} = harness().controller('IntegrationDetail');
  models.parameters.setProperty('/groups', d._groupParams([
    {key:'secret', value:'********', secure:true},
    {key:'redacted', value:null, redacted:true, defaultValue:'placeholder'},
    {key:'ordinary', value:'old'}, {key:'clear', value:'old'}, {key:'default', value:'', defaultValue:'fallback'}
  ]));
  assert.deepEqual(plain(d._collectParams()), []);
  d._findParam('ordinary').value='new'; d._findParam('clear').value='';
  assert.deepEqual(plain(d._collectParams()), [
    {key:'ordinary',value:'new',dataType:'xsd:string',action:'set'},
    {key:'clear',value:'',dataType:'xsd:string',action:'clear'}
  ]);
  d._findParam('secret').value='replacement';
  assert.equal(d._collectParams()[0].value, 'replacement');
  d._findParam('secret').value='[redacted]';
  assert.throws(() => d._collectParams(), /masked/);
});

const parity = require('../fixtures/parity.json');
const {odata, json} = require('./helpers.cjs');
test('destination reference agrees with shared catalog and log parity fixture', async () => {
  const h=harness({fetch:url => {
    if(url.endsWith('/IntegrationRuntimeArtifacts')) return odata([parity.runtime]);
    if(url.includes('/IntegrationDesigntimeArtifacts(')) return json({d:parity.design});
    if(url.includes('/MessageProcessingLogs')) return odata(parity.logs);
    throw new Error(url);
  }});
  const c=h.load('webapp/service/BackendClient.js');
  const rows=await c.getIntegrationsWithMetadata();
  assert.deepEqual(Object.fromEntries(Object.keys(parity.expected).map(k=>[k,rows[0][k]])),parity.expected);
  assert.deepEqual(plain(await c.getMessageLogs('runtime-id')),[parity.expectedLog]);
});
