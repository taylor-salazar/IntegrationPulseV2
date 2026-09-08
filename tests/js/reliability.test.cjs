const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, json, odata, deferred, flush, plain, defect, Model } = require('./helpers.cjs');
const fixtures = require('../fixtures/contracts.json');

test('Component invokes base startup then installs device model before router initialization', () => {
  const order = [];
  const base = { prototype: { init() { order.push('base'); } }, extend: (_, methods) => methods };
  const h = harness({ overrides: { 'sap/ui/core/UIComponent': base, 'integrationpulse/model/models': { createDeviceModel: () => 'device' } } });
  const component = h.load('webapp/Component.js');
  component.init.call({ setModel(m, n) { assert.equal(m, 'device'); assert.equal(n, 'device'); order.push('model'); }, getRouter: () => ({ initialize() { order.push('router'); } }) });
  assert.deepEqual(order, ['base', 'model', 'router']);
});
test('formatters handle missing/unknown statuses, invalid timestamps and SAP dates', () => {
  const f = harness().load('webapp/model/formatter.js');
  assert.equal(f.statusState('started'), 'Success'); assert.equal(f.statusState('unknown'), 'None');
  assert.equal(f.logState('FAILED'), 'Error'); assert.equal(f.logState(null), 'None');
  assert.equal(f.dateTime('bad-date'), 'bad-date'); assert.equal(f.dateTime(''), '');
  assert.equal(f.dateTime('/Date(1000+0000)/'), new Date(1000).toLocaleString());
  assert.equal(f.duration('bad'), ''); assert.equal(f.duration(1500), '1.5 s'); assert.equal(f.bytes(1024), '1.0 KB');
});
test('Home loads latest logs in date order, retains integrations when per-item log request fails', async () => {
  const h = harness({ overrides: { 'integrationpulse/service/BackendClient': {
    getIntegrationsWithMetadata: () => Promise.resolve([{ id: 'a', sender: 'SAP' }, { id: 'b' }]),
    getMessageLogs: id => id === 'a' ? Promise.resolve([{ messageId: 'old', status: 'FAILED', logEnd: 'bad' }, { messageId: 'new', status: 'COMPLETED', logEnd: '/Date(2000)/' }]) : Promise.reject(new Error('unavailable'))
  } } });
  const { instance, models } = h.controller('Home'); instance._loadLastRuns(); await flush();
  assert.equal(models.home.getProperty('/busy'), false);
  assert.equal(models.home.getProperty('/lastRuns').length, 2);
  assert.equal(models.home.getProperty('/lastRuns/0/messageId'), 'new');
  assert.equal(models.home.getProperty('/lastRuns/0/unresolvedIssues'), 1);
});
test('Monitoring Detail tolerates missing payload service and filters discarded rows', async () => {
  const h = harness({ overrides: { 'integrationpulse/service/BackendClient': {
    getMonitoringItem: () => Promise.resolve({ id: 'id' }), getMessageLogs: () => Promise.resolve(fixtures.logs), getPayloads: () => Promise.reject(new Error('unavailable'))
  } } });
  const { instance, models } = h.controller('MonitoringDetail'); instance._sId = 'id'; instance._load(); await flush();
  assert.equal(models.monDetailView.getProperty('/busy'), false); assert.equal(models.logs.getProperty('/items').length, 3);
  assert.ok(models.logs.getProperty('/items').every(l => !l.hasPayload));
});
test('metadata candidate resolution evidence: first plausible successful match wins', async () => {
  // Characterization of an unsupported identity assumption, not an assertion
  // that this artifact is semantically the correct one in a real tenant.
  const calls = [];
  const h = harness({ fetch: url => {
    calls.push(url);
    if (url.includes('$filter=')) return odata([{ Id: 'first', Name: 'runtime', Version: '8' }, { Id: 'second', Name: 'runtime', Version: '9' }]);
    if (url.includes("Id='first'") && url.includes("Version='8'")) return odata([{ ParameterKey: 'selected', ParameterValue: 'first' }]);
    return new Response('not found', { status: 404 });
  } });
  const result = await h.load('webapp/service/BackendClient.js').getConfigurations('runtime', {});
  assert.equal(result[0].value, 'first');
  assert.ok(calls.some(u => u.includes("Id='first',Version='Active'")), 'candidate IDs/versions form a Cartesian product');
});
test('BAS-sensitive key literal escaping is equivalent between apostrophe and percent encodings', () => {
  const escaped = "O''Brien";
  assert.equal(decodeURIComponent(encodeURIComponent(escaped)), decodeURIComponent('O%27%27Brien'));
  // This proves local single-decode equivalence only, not BAS proxy semantics.
});
test('proxy/cached data is bounded to provided catalog; partial enrichment does not throw', async () => {
  const h = harness({ search: '?api=proxy', fetch: () => json([{ id: 'a', name: 'A', isRuntimeArtifact: true }, { id: 'b', isRuntimeArtifact: false }]) });
  const rows = await h.load('webapp/service/BackendClient.js').getIntegrationsWithMetadata();
  assert.equal(rows.length, 1); assert.equal(h.calls.length, 1);
});
test('destination monitoring request count exposes duplicate runtime collection reads', async t => {
  const h = harness({ fetch: url => url.endsWith('/IntegrationRuntimeArtifacts') ? odata([fixtures.runtime]) : json({ d: fixtures.design }) });
  const { instance, models } = h.controller('Monitoring'); instance._loadData(); await flush();
  assert.equal(models.monitoring.getProperty('/items').length, 1);
  const reads = h.calls.filter(c => c.url.endsWith('/IntegrationRuntimeArtifacts')).length;
  assert.equal(reads, 2);
  t.diagnostic('MEASURED local HTTP work: 2 runtime collection GETs + 1 metadata GET for one cold Monitoring load; no message log query. This is characterization, not an efficiency target.');
});
test('malformed schedules are retained as raw values when opened and saved untouched', () => {
  const { instance: d, models } = harness().controller('IntegrationDetail');
  for (const value of ['', 'bad', '0 0 12 ? * MON-FRI *', 'unsupported --tz=UTC']) {
    models.parameters.setProperty('/groups', d._groupParams([{ key: 'timer.cron', value }]));
    assert.equal(d._collectParams()[0].value, value); assert.equal(models.detailView.getProperty('/dirty'), false);
  }
});
test('review unresolved count exposes one storage read per failed log', t => {
  let reads = 0;
  const h = harness({ localStorage: { getItem: () => { reads++; return '{}'; }, setItem() {} } });
  const store = h.load('webapp/service/ReviewStore.js');
  assert.equal(store.countUnresolvedFailed(Array.from({ length: 1000 }, (_, i) => ({ messageId: String(i), status: 'FAILED' }))), 1000);
  assert.equal(reads, 1000);
  t.diagnostic('MEASURED local work: 1,000 failed rows cause 1,000 synchronous localStorage reads/JSON parses. A proposed optimization must reduce this count; this test records current cost.');
});
test('network failure clears Home/Monitoring/Detail loading indicators', async () => {
  const fail = () => Promise.reject(new Error('network unavailable'));
  const api = { isMock: () => false, getIntegrationsWithMetadata: fail, getMonitoring: fail, getIntegration: fail, getMonitoringItem: fail, getMessageLogs: fail, getPayloads: fail };
  for (const [name, action, model] of [['Home', '_loadLastRuns', 'home'], ['Monitoring', '_loadData', null], ['IntegrationDetail', '_load', 'detailView'], ['MonitoringDetail', '_load', 'monDetailView']]) {
    const h = harness({ overrides: { 'integrationpulse/service/BackendClient': api } }); const c = h.controller(name);
    c.instance._sId = 'id'; c.instance[action](); await flush();
    assert.equal(model ? c.models[model].getProperty('/busy') : c.view.busy, false);
    assert.equal(h.notices.length, 1);
  }
});
defect('QA-21', 'Integration Detail never requests its displayed payload list on load', async () => {
  let calls = 0;
  const h = harness({ overrides: { 'integrationpulse/service/BackendClient': { getIntegration: () => Promise.resolve({ id: 'id' }), getConfigurations: () => Promise.resolve([]), getPayloads: () => { calls++; return Promise.resolve([{ id: 'payload' }]); } } } });
  const { instance: d } = h.controller('IntegrationDetail'); d._sId = 'id'; d._load(); await flush();
  assert.equal(calls, 1);
});
defect('QA-06', 'late response updates detail models after onExit', async () => {
  const pending = deferred();
  const h = harness({ overrides: { 'integrationpulse/service/BackendClient': { getIntegration: () => pending.promise, getConfigurations: () => Promise.resolve([]) } } });
  const { instance: d, models } = h.controller('IntegrationDetail'); d._sId = 'id'; d._load(); d.onExit(); pending.resolve({ id: 'late' }); await flush();
  assert.equal(models.integration.getProperty('/id'), undefined);
});
defect('QA-08', 'repeated Save and Deploy submissions lack an internal in-flight guard', async () => {
  const counts = [];
  for (const action of ['onSaveDraft', '_doDeploy']) {
    let calls = 0; const pending = deferred(); const hit = () => { calls++; return pending.promise; };
    const h = harness({ overrides: { 'integrationpulse/service/BackendClient': { updateConfigurations: hit, deployIntegration: hit } } });
    const { instance: d } = h.controller('IntegrationDetail'); d._sId = 'id'; d[action]('name'); d[action]('name'); pending.resolve({}); await flush();
    counts.push(calls);
  }
  assert.deepEqual(counts, [1, 1]);
});
defect('QA-22', 'unknown query options are lost when fields are added', () => {
  const { instance: d } = harness().controller('IntegrationDetail');
  d._oPulseBaseQuery = d._parsePulseQuery('$select=userId&$top=25&fromDate=2026-01-01');
  d._oPulseSelectTextArea = { getValue: () => 'newField' };
  const result = d._getPulseRunOptionsFromDialog().pulseQuery;
  assert.ok(result.includes('$top=25') && result.includes('fromDate=2026-01-01'));
}, { provisional: true });
