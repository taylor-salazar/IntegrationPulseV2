const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, json, odata, deferred, flush, plain } = require('./helpers.cjs');

const now = Date.parse('2026-09-08T12:00:00Z');
class FixedDate extends Date { static now() { return now; } }
const log = (id, time, status = 'COMPLETED') => ({ MessageGuid: id, LogEnd: time, Status: status });

test('destination counts use UTC boundaries, deduplicate pages and keep tenant next links on destination', async () => {
  const h = harness({ clock: FixedDate, fetch: url => {
    const parsed = new URL(url, 'http://local.test');
    if (parsed.searchParams.has('$skiptoken')) return odata([
      log('boundary', '2026-09-07T12:00:00Z', 'FAILED'), log('now', '2026-09-08T12:00:00')
    ]);
    assert.equal(parsed.searchParams.get('$filter'), "IntegrationFlowName eq 'O''Brien/&' and LogEnd ge datetime'2026-09-07T12:00:00'");
    return json({ d: { results: [
      log('boundary', '2026-09-07T12:00:00Z', 'FAILED'),
      log('old', '2026-09-07T11:59:59.999Z'), log('future', '2026-09-08T12:00:00.001Z'),
      log('offset', '2026-09-08T05:00:00-07:00'), log('sap', `/Date(${now - 1000}+0000)/`, 'FAILED'),
      log('bad', 'not-a-date'), log('discard', '2026-09-08T12:00:00Z', 'DISCARDED')
    ], __next: 'https://tenant.test/api/v1/MessageProcessingLogs?$skiptoken=next' } });
  } });
  const rows = await h.load('webapp/service/BackendClient.js').getMonitoring([{ id: "O'Brien/&" }]);
  assert.equal(rows[0].messages24h, 4); assert.equal(rows[0].errors24h, 2);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].url, 'http://local.test/api/v1/MessageProcessingLogs?$skiptoken=next');
  assert.equal(h.load('webapp/model/formatter.js').timestamp('2026-09-08T12:00:00'), now);
});

test('destination count failures and invalid/repeating pages reject instead of reporting zero', async () => {
  for (const next of [42, 'https://tenant.test/api/v1/Other', 'https://user:pw@tenant.test/api/v1/MessageProcessingLogs', '/api/v1/MessageProcessingLogs?$skiptoken=repeat']) {
    const h = harness({ fetch: () => json({ d: { results: [], __next: next } }) });
    await assert.rejects(h.load('webapp/service/BackendClient.js').getMonitoring([{ id: 'id' }]), /invalid|repeated/);
    assert.ok(h.calls.length <= 2);
  }
  const h = harness({ fetch: () => new Response('unavailable', { status: 503 }) });
  await assert.rejects(h.load('webapp/service/BackendClient.js').getMonitoring([{ id: 'id' }]), /unavailable/);
});

test('destination monitoring limits simultaneous log reads to six and preserves order', async () => {
  let active = 0, peak = 0;
  const h = harness({ fetch: async () => { peak = Math.max(peak, ++active); await flush(); active--; return odata([]); } });
  const inputs = Array.from({ length: 19 }, (_, i) => ({ id: String(i) }));
  const rows = await h.load('webapp/service/BackendClient.js').getMonitoring(inputs);
  assert.equal(peak, 6); assert.equal(h.calls.length, 19);
  assert.deepEqual(plain(rows).map(r => r.id), inputs.map(r => r.id));
});

test('query additions preserve encoded filter and repeated unknown options without creating separators', () => {
  const { instance: d } = harness().controller('IntegrationDetail');
  const filter = "name eq '员工 & + % # ?'";
  const base = '$select=constructor&$filter=' + encodeURIComponent(filter) + '&custom=a%26b%2Bc&custom=%E5%91%98%E5%B7%A5&$top=25&flag';
  d._oPulseBaseQuery = d._parsePulseQuery(base);
  assert.equal(d._getPulseRunOptionsFromDialog().pulseQuery, '');
  d._oPulseSelectTextArea = { getValue: () => 'toString,newField' };
  const result = d._getPulseRunOptionsFromDialog().pulseQuery;
  const parsed = d._parsePulseQuery(result);
  assert.equal(parsed.filter, filter);
  assert.deepEqual(plain(parsed.other), plain(d._oPulseBaseQuery.other));
  assert.deepEqual(plain(parsed.select), ['constructor', 'toString', 'newField']);
  assert.ok([...result].every(c => c.charCodeAt(0) < 128));
});

test('editing a cron start preserves its divisor, weekday restriction and absent timezone', () => {
  const { instance: d } = harness().controller('IntegrationDetail');
  const schedule = d._scheduleFromCron('0 0/15 9-17 ? * MON-FRI *');
  schedule.minutes = ['5'];
  assert.equal(d._scheduleToCron(schedule), '0 5/15 9-17 ? * MON-FRI *');
  schedule.seconds = ['30'];
  assert.equal(d._scheduleToCron(schedule), '30 5/15 9-17 ? * MON-FRI *');
  const malformed = d._scheduleFromCron('unsupported'); malformed.seconds = ['12'];
  assert.throws(() => d._scheduleToCron(malformed), /Unsupported schedule/);
});

test('late payloads and saved values cannot overwrite a different active integration', async () => {
  for (const action of ['onSaveDraft', '_doDeploy']) {
    const mutation = deferred(), payloads = deferred();
    const h = harness({ overrides: { 'integrationpulse/service/BackendClient': {
      getIntegration: id => Promise.resolve({ id, status: 'STOPPED' }),
      getConfigurations: id => Promise.resolve([{ key: 'field', value: id }]),
      getPayloads: id => id === 'a' ? payloads.promise : Promise.resolve([{ id: 'b-payload' }]),
      updateConfigurations: () => mutation.promise, deployIntegration: () => mutation.promise
    } } });
    const { instance: d, models } = h.controller('IntegrationDetail');
    d._sId = 'a'; d._load(); await flush(); const saving = d[action]('A');
    d._sId = 'b'; d._load(); await flush();
    const param = models.parameters.getProperty('/groups/0/params/0'); param.value = 'b-unsaved'; d._recomputeDirty();
    mutation.resolve({ status: 'STARTED' }); payloads.resolve([{ id: 'a-payload' }]); await saving; await flush();
    assert.equal(models.integration.getProperty('/id'), 'b'); assert.equal(models.integration.getProperty('/status'), 'STOPPED');
    assert.equal(param.pristineValue, 'b'); assert.equal(models.detailView.getProperty('/dirty'), true);
    assert.equal(models.payloads.getProperty('/items/0/id'), 'b-payload');
  }
});

test('mutation guard permits retry after failure and blocks simultaneous action types', async () => {
  const pending = deferred(); let calls = 0;
  const h = harness({ overrides: { 'integrationpulse/service/BackendClient': {
    updateConfigurations: () => { calls++; return calls === 1 ? pending.promise : Promise.resolve({}); },
    deployIntegration: () => assert.fail('concurrent deploy'), triggerImmediateRun: () => assert.fail('concurrent run')
  } } });
  const { instance: d, models } = h.controller('IntegrationDetail'); d._sId = 'id';
  const first = d.onSaveDraft(); d._doDeploy('name'); d._doDeployImmediately({ id: 'id' }, 'name', {});
  pending.reject(new Error('failed')); await first; assert.equal(models.detailView.getProperty('/busy'), false);
  await d.onSaveDraft(); assert.equal(calls, 2);
});

test('late payload fragment is destroyed after navigation and load errors stay controlled', async () => {
  const fragment = deferred(); let opened = 0, destroyed = 0;
  const h = harness({ overrides: { 'sap/ui/core/Fragment': { load: () => fragment.promise } } });
  const { instance: d } = h.controller('IntegrationDetail'); d._sId = 'id';
  const loading = d._openPayloadDialog(); d._onAnyRouteMatched({ getParameter: () => 'home' });
  fragment.resolve({ open: () => opened++, destroy: () => destroyed++ }); await loading;
  assert.equal(opened, 0); assert.equal(destroyed, 1);
});

test('XML parser rejects ambiguous identities and DTDs, and decodes XML attributes', () => {
  const { instance: d } = harness().controller('IntegrationDetail');
  for (const xml of [
    '<Schema><EntityType Name="E"><Property Name="id"/><Property Name="id"/></EntityType></Schema>',
    '<Schema><EntityType Name="E"/><EntityType Name="E"/></Schema>',
    '<!DOCTYPE Schema [<!ENTITY name "E">]><Schema><EntityType Name="&name;"/></Schema>'
  ]) assert.throws(() => d._parseEdmxMetadata(xml));
  const metadata = d._parseEdmxMetadata('<x:Schema xmlns:x="urn:test"><x:EntityType Name="E"><x:Property Name="A&amp;B"/></x:EntityType></x:Schema>');
  assert.deepEqual(plain(metadata.entityTypes.E.properties), ['A&B']);
});
