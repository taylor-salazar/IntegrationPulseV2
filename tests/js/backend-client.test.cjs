const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, harness, json, odata, plain, deferred, flush, regression } = require('./helpers.cjs');
const fixtures = require('../fixtures/contracts.json');
const client = h => h.load('webapp/service/BackendClient.js');
function sapBoundary(url, options) {
  if (url.endsWith('/IntegrationRuntimeArtifacts')) return odata([fixtures.runtime]);
  if (url.includes('/Configurations') && options.method !== 'POST') return odata([{ ParameterKey: 'filter.query', ParameterValue: '原始\n<script>&%+', DataType: 'xsd:string' }]);
  if (url.includes('/IntegrationDesigntimeArtifacts(')) return json({ d: fixtures.design });
  if (url.endsWith('/$batch')) return new Response('HTTP/1.1 204 No Content');
  if (url.includes('/DeployIntegrationDesigntimeArtifact?')) return new Response('task-1', { status: 202 });
  throw new Error('Unexpected SAP boundary: ' + url);
}

for (const [search, mock, mode] of [['', false, 'destination'], ['?mock=true', true, 'destination'], ['?mock=false&api=proxy', false, 'proxy'], ['?mock=bad&api=bad', false, 'destination']]) {
  test('mode overrides ' + (search || 'default'), () => {
    const c = client(harness({ search })); assert.equal(c.isMock(), mock); assert.equal(c.getLiveMode(), mode);
  });
}
test('catalog is driven only by runtime; enrichment cannot add design-only artifacts', async () => {
  const h = harness({ fetch: sapBoundary }); const c = client(h);
  const rows = await c.getIntegrationsWithMetadata();
  assert.equal(rows.length, 1); assert.equal(rows[0].id, fixtures.runtime.Id);
  assert.equal(rows[0].designTimeId, fixtures.design.Id); assert.equal(rows[0].version, '1.0');
  assert.equal(rows[0].designTimeVersion, '2.0');
  assert.ok(h.calls.every(c => !c.url.endsWith('/IntegrationDesigntimeArtifacts')));
  const count = h.calls.length; await c.enrichIntegrationMetadata(rows[0]);
  assert.equal(h.calls.length, count, 'metadata cached under stable identity');
});
test('mock mode shares repository fixtures; writes/run are simulations with no HTTP mutation', async () => {
  const h = harness({ search: '?mock=true', immediateTimers: true, fetch: url => json(JSON.parse(fs.readFileSync(path.join(ROOT, url.slice(1)), 'utf8'))) });
  const c = client(h); const rows = await c.getIntegrations(); assert.ok(rows.length);
  const configs = await c.getConfigurations(rows[0].id);
  assert.ok(Array.isArray(configs)); assert.equal(await c.getIntegration('absent'), null);
  await c.getMonitoring(); await c.getMessageLogs(rows[0].id); await c.getPayloads(rows[0].id);
  await c.updateConfigurations(rows[0].id, []); await c.deployIntegration(rows[0].id, []); await c.triggerImmediateRun(rows[0]);
  assert.ok(h.calls.every(c => !c.method));
});
test('empty and large catalogs remain runtime-only; duplicates are retained as received', async () => {
  for (const raw of [[], [{}, { Id: 'design-only', isRuntimeArtifact: false }], Array.from({ length: 2000 }, (_, i) => ({ Id: 'r' + i }))]) {
    const h = harness({ fetch: () => odata(raw) }); const rows = await client(h).getIntegrations();
    assert.equal(rows.length, raw.length === 2000 ? 2000 : 0); assert.equal(h.calls.length, 1);
  }
  assert.equal((await client(harness({ fetch: () => odata([fixtures.runtime, fixtures.runtime]) })).getIntegrations()).length, 2);
});
for (const id of fixtures.sensitiveIds) {
  test('configuration literal decodes once to original ID: ' + id, async () => {
    const h = harness({ fetch: url => url.endsWith('/Configurations') ? odata([]) : json({d:{Id:id,Version:'2.0'}}) });
    await client(h).getConfigurations(id, { designTimeId: id, designTimeVersion: '2.0' });
    const decoded = decodeURIComponent(h.calls.at(-1).url);
    assert.equal(decoded, `/api/v1/IntegrationDesigntimeArtifacts(Id='${id.replaceAll("'", "''")}',Version='2.0')/Configurations`);
    assert.equal(h.calls.length, 2);
  });
  test('destination log filter uses exactly one encoding layer: ' + id, async () => {
    const h = harness({ fetch: () => odata([]) }); await client(h).getMessageLogs(id);
    assert.equal(new URL(h.calls[0].url, 'http://local.test').searchParams.get('$filter'), `IntegrationFlowName eq '${id.replaceAll("'", "''")}'`);
  });
}
test('version mismatch tries candidates and retains configuration text', async () => {
  const h = harness({ fetch: url => url.includes("Version='1.0'") ? (url.endsWith('/Configurations') ? odata([{ ParameterKey: 'a', ParameterValue: '000\n员工&+%' }]) : json({ d: { Id: 'id', Version: '1.0' } })) : new Response('not found', { status: 404 }) });
  const values = await client(h).getConfigurations('id', { version: '1.0' });
  assert.equal(values[0].value, '000\n员工&+%'); assert.equal(h.calls.length, 4);
});
test('missing artifact fails with candidate diagnostics and no tenant-wide catalog call', async () => {
  const h = harness({ fetch: () => new Response('SAP not found', { status: 404 }) });
  await assert.rejects(client(h).getConfigurations('id', { name: 'name', packageName: 'pkg' }), /Tried IDs: id, name; versions: Active, active/);
  assert.ok(h.calls.every(c => c.url.includes('(') || c.url.includes('$filter=')));
});
test('save batch is lossless, uses resolved identity and precedes deploy; never triggers run', async () => {
  const h = harness({ fetch: sapBoundary }); const c = client(h);
  const values = fixtures.parameters.concat([{ key: "a'b/%", value: '\r\n<script>员工&+%000', dataType: 'custom' }]);
  await c.deployIntegration('runtime-id', values);
  const writes = h.calls.filter(c => c.method === 'POST'); assert.equal(writes.length, 2);
  assert.equal(writes[0].url, '/api/v1/$batch'); assert.match(writes[0].body, /PUT IntegrationDesigntimeArtifacts\(Id='design-id',Version='2.0'\)/);
  const parts = writes[0].body.split('\r\n').filter(s => s.startsWith('{')).map(JSON.parse);
  assert.deepEqual(parts.map(p => p.ParameterValue), values.map(p => p.value));
  assert.match(writes[1].url, /DeployIntegrationDesigntimeArtifact\?Id='design-id'&Version='2.0'/);
  assert.ok(h.calls.every(c => !c.url.startsWith('/http')));
});
test('inner batch failure prevents deploy even when outer HTTP succeeds', async () => {
  const h = harness({ fetch: (u, o) => u.endsWith('/$batch') ? new Response('HTTP/1.1 400 Bad Request') : sapBoundary(u, o) });
  await assert.rejects(client(h).deployIntegration('runtime-id', fixtures.parameters), /Batch update failed/);
  assert.equal(h.calls.filter(c => c.url.includes('/DeployIntegration')).length, 0);
});
for (const code of [400, 401, 403, 404, 409, 429, 500, 503]) {
  test('HTTP ' + code + ' propagates from catalog/save/deploy/run at mocked boundaries', async () => {
    const fail = () => new Response('upstream failure', { status: code });
    await assert.rejects(client(harness({ fetch: fail })).getIntegrations(), /upstream failure/);
    for (const method of ['updateConfigurations', 'deployIntegration']) {
      const h = harness({ fetch: (u, o) => o.method === 'POST' ? fail() : sapBoundary(u, o) });
      await assert.rejects(client(h)[method]('runtime-id', fixtures.parameters), /upstream failure/);
    }
    await assert.rejects(client(harness({ fetch: fail })).triggerImmediateRun({ id: 'id', endpoint: '/run' }), /upstream failure/);
  });
}
test('network timeout, malformed JSON and empty GET fail explicitly', async () => {
  for (const boundary of [() => { throw new Error('timeout'); }, () => new Response('{bad'), () => new Response('')]) {
    await assert.rejects(client(harness({ fetch: boundary })).getIntegrations());
  }
});
test('immediate endpoint normalized and no query headers without changes', async () => {
  for (const endpoint of ['/run', 'run', '/http/run']) {
    const h = harness({ fetch: () => new Response('', { status: 202 }) });
    await client(h).triggerImmediateRun({ id: 'id', endpoint });
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].url, '/http/run');
    assert.equal(h.calls[0].body, '{}'); assert.equal(h.calls[0].method, 'POST');
    assert.ok(!Object.keys(h.calls[0].headers).some(k => /query/i.test(k)));
  }
  const h = harness(); await assert.rejects(client(h).triggerImmediateRun({ id: 'id' }), /No HTTPS/); assert.equal(h.calls.length, 0);
});
test('real controller → additive query → real client → all three headers', async () => {
  const h = harness({ fetch: () => new Response('', { status: 202 }) });
  const { instance: d } = h.controller('IntegrationDetail');
  d.getModel('parameters').setProperty('/groups', d._groupParams(fixtures.parameters));
  d._oPulseBaseQuery = d._parsePulseQuery(d._findParamValue('filter.query'));
  d._oPulseSelectTextArea = { getValue: () => 'customString1' };
  d._oPulseExpandTextArea = { getValue: () => 'managerNav' };
  const options = d._getPulseRunOptionsFromDialog();
  await client(h).triggerImmediateRun({ id: 'id' }, options);
  assert.equal(h.calls[0].url, '/http/IntegrationPulse/run');
  for (const key of ['filter.pulseQuery', 'filter-pulseQuery', 'X-Pulse-Query']) assert.equal(h.calls[0].headers[key], options.pulseQuery);
  assert.match(options.pulseQuery, /userId,startDate,companyNav\/name,customString1/);
  assert.match(options.pulseQuery, /companyNav,managerNav/);
  assert.deepEqual(plain(d._collectParams()), []);
  for (const p of fixtures.parameters) assert.equal(d._findParam(p.key).value, p.value);
});
test('proxy request contracts encode query identity and serialize bodies/204', async () => {
  const h = harness({ search: '?mock=false&api=proxy', fetch: () => new Response(null, { status: 204 }) });
  const c = client(h); await c.updateConfigurations('a %+/b', fixtures.parameters); await c.deployIntegration('a %+/b', []); await c.triggerImmediateRun({ id: 'a %+/b', endpoint: '/run' }, { pulseQuery: '$select=a' });
  assert.ok(h.calls.every(c => c.url.startsWith('http://proxy.test/api/integrations/by-id/')));
  assert.ok(h.calls.every(c => new URL(c.url).searchParams.get('integrationId') === 'a %+/b'));
  assert.deepEqual(JSON.parse(h.calls[0].body), { configurations: fixtures.parameters });
  assert.equal(h.calls[0].method, 'PUT'); assert.equal(JSON.parse(h.calls[2].body).pulseQuery, '$select=a');
});
test('discarded logs filtered and payload URL metadata encoded', async () => {
  const h = harness({ fetch: url => url.includes('MessageProcessingLogs') ? odata(fixtures.logs.map(l => ({ MessageGuid: l.messageId, Status: l.status, LogEnd: l.logEnd }))) : json([]) });
  const c = client(h); assert.equal((await c.getMessageLogs('id')).length, 3);
  await c.getPayloads('a/b &%'); assert.equal(new URL(h.calls.at(-1).url, 'http://local.test').searchParams.get('integrationId'), 'a/b &%');
});
test('metadata queue caps concurrent requests at six and caches repeated work', async () => {
  const pending = []; let active = 0, peak = 0;
  const h = harness({ fetch: url => {
    if (url.endsWith('/IntegrationRuntimeArtifacts')) return odata(Array.from({ length: 24 }, (_, i) => ({ Id: 'r' + i, Name: 'r' + i })));
    const d = deferred(); pending.push(() => { active--; d.resolve(json({ d: { Id: /Id='([^']+)/.exec(url)[1] } })); }); active++; peak = Math.max(peak, active); return d.promise;
  } });
  const p = client(h).getIntegrationsWithMetadata(); await flush();
  while (pending.length) { pending.splice(0).forEach(resolve => resolve()); await flush(); }
  assert.equal((await p).length, 24); assert.equal(peak, 6); assert.equal(h.calls.length, 25);
});
regression('QA-01', 'failed enrichment erases valid runtime source/target', async () => {
  const h = harness({ fetch: url => url.endsWith('/IntegrationRuntimeArtifacts') ? odata([fixtures.runtime]) : new Response('unavailable', { status: 404 }) });
  const rows = await client(h).getIntegrationsWithMetadata();
  assert.equal(rows[0].sender, fixtures.runtime.Sender);
});
regression('QA-02', 'malformed successful configuration response is accepted as empty', async () => {
  const h = harness({ fetch: () => json({ unexpected: 'shape' }) }); let error;
  try { await client(h).getConfigurations('id', {}); } catch (e) { error = e; }
  assert.ok(error, 'Malformed response must not be treated as a valid empty configuration');
});
