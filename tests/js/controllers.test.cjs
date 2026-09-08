const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, harness, storage, deferred, flush, plain, defect } = require('./helpers.cjs');
const fixtures = require('../fixtures/contracts.json');
function detail(options) {
  const h = harness(options); const c = h.controller('IntegrationDetail');
  c.instance._sId = 'runtime-id'; c.models.integration.setData({ id: 'runtime-id', designTimeId: 'design-id', name: 'Name' });
  c.models.parameters.setProperty('/groups', c.instance._groupParams(structuredClone(fixtures.parameters)));
  return { ...c, h };
}
function query(base, select = '', expand = '', filters = []) {
  const { instance: d } = detail(); d._oPulseBaseQuery = d._parsePulseQuery(base);
  d._oPulseSelectTextArea = { getValue: () => select }; d._oPulseExpandTextArea = { getValue: () => expand }; d._aPulseFilters = filters;
  return d;
}
test('controller startup registers expected routes and clean state', () => {
  for (const [name, route] of [['Home', 'home'], ['Integrations', 'integrations'], ['IntegrationDetail', 'integrationDetail'], ['Monitoring', 'monitoring'], ['MonitoringDetail', 'monitoringDetail']]) {
    const c = harness().controller(name); assert.ok(c.routes.some(r => r.name === route));
    assert.ok(c.routes.every(r => r.ctx === c.instance));
  }
});
test('raw integration ID handoff is unchanged before UI5 routing (routing itself remains manual)', () => {
  const h = harness(); const catalog = h.controller('Integrations');
  for (const id of fixtures.sensitiveIds) {
    catalog.instance.onOpenIntegration({ getSource: () => ({ getBindingContext: () => ({ getProperty: () => id }) }) });
    assert.equal(catalog.navigation.at(-1)[1].id, id);
  }
});
test('grouping, value types, dirty state, reset and untouched timer preserve parameter values', () => {
  const { instance: d, models } = detail();
  const values = ['', null, 'false', '000123', '0', 'line1\nline2', '员工 &%+ <script>', 'x'.repeat(10000)];
  const configs = values.map((value, i) => ({ key: 'odd.k' + i, value, dataType: i % 2 ? 'unknown' : 'xsd:string' }));
  models.parameters.setProperty('/groups', d._groupParams(configs));
  assert.deepEqual(plain(d._collectParams()).map(p => p.value), values);
  d._recomputeDirty(); assert.equal(models.detailView.getProperty('/dirty'), false);
  models.parameters.getProperty('/groups')[0].params[0].value = 'changed'; d.onParamChange();
  assert.equal(models.detailView.getProperty('/dirty'), true); d.onReset();
  assert.deepEqual(plain(d._collectParams()).map(p => p.value), values);
  models.parameters.setProperty('/groups', d._groupParams(fixtures.parameters));
  assert.equal(d._collectParams().find(p => p.key === 'timer.cron').value, fixtures.parameters.at(-1).value);
  assert.equal(models.parameters.getProperty('/groups')[0].prefix, 'pulse');
  assert.equal(d._groupParams([]).length, 0);
});
test('duplicate ordinary parameter keys remain separate and unknown types survive serialization', () => {
  const { instance: d, models } = detail();
  models.parameters.setProperty('/groups', d._groupParams([{ key: 'a', value: '1' }, { key: 'a', value: '2', dataType: 'custom' }]));
  assert.equal(d._collectParams().length, 2); assert.equal(d._collectParams()[1].dataType, 'custom');
});
test('feature flags derive from parameters and unsupported action does not open dialog', () => {
  const { instance: d, models } = detail(); d._updateStandardFeatureFlags();
  assert.equal(models.detailView.getProperty('/immediateRunSupported'), true); assert.equal(models.detailView.getProperty('/sourceIsSuccessFactors'), true);
  d._findParam('pulse.immediateRunSupported').value = 'false'; d._findParam('pulse.Source').value = 'SAP'; d.onParamChange();
  assert.equal(models.detailView.getProperty('/sourceIsSuccessFactors'), false);
  d._openPulseRunDialog = () => assert.fail('unsupported dialog opened'); d.onDeployImmediately();
});
for (const base of ['', '$select=userId', '$expand=companyNav', '$filter=active eq true', '?%24select=userId%2CstartDate&%24expand=companyNav', '$select= userId,userId, startDate &$expand=companyNav,companyNav&$filter=active eq true', 'malformed', '$select=a%ZZ']) {
  test('no changes emits no query header: ' + base, () => {
    assert.equal(query(base)._getPulseRunOptionsFromDialog().pulseQuery, '');
  });
}
for (const count of [1, 25, 2000]) {
  test('query additions retain baseline fields and navigation: ' + count, () => {
    const added = Array.from({ length: count }, (_, i) => 'custom' + i);
    const d = query(fixtures.parameters[4].value, added.join(','), 'managerNav,companyNav', [{ field: 'lastName', operation: 'eq', value: "O'Brien" }]);
    const result = d._parsePulseQuery(d._getPulseRunOptionsFromDialog().pulseQuery);
    for (const field of ['userId', 'startDate', 'companyNav/name', ...added]) assert.ok(result.select.includes(field));
    assert.deepEqual(plain(result.expand), ['companyNav', 'managerNav']);
    assert.equal(result.filter, "(active eq true) and (lastName eq 'O''Brien')");
  });
}
test('filter operations quote text safely and retain OR grouping', () => {
  const d = query('', '', '', [{ field: 'company', operation: 'in', value: 'A,B' }, { field: 'active', operation: 'eq', value: 'true' }]);
  assert.equal(d._buildPulseFilterQuery(), "(company eq 'A' or company eq 'B') and active eq true");
  assert.equal(d._buildPulseFilterExpression('name', 'contains', "a'b"), "substringof('a''b',name)");
});
test('EDMX real parser maps entities, association targets and lazy root options', () => {
  const { instance: d } = detail(); const xml = fs.readFileSync(path.join(ROOT, 'tests/fixtures/successfactors.edmx'), 'utf8');
  const metadata = d._parseEdmxMetadata(xml); const options = d._buildEdmxQueryOptions(metadata, 'EmpJob');
  assert.deepEqual(plain(options.selectFields).map(p => p.key), ['userId', 'startDate']);
  assert.equal(options.entityTypes.EmpJob.navs[0].target, 'Company');
  assert.equal(options.expandFields[0].key, 'companyNav');
  assert.throws(() => d._parseEdmxMetadata(''), /pulseEdmxInvalid/);
  assert.throws(() => d._buildEdmxQueryOptions(metadata, 'Missing'), /pulseEdmxEntityNotFound/);
  d._storeEdmxOptions('EmpJob', options); assert.equal(d._getCachedEdmxOptions('EmpJob').rootEntity, 'EmpJob');
  const large = '<Schema>' + Array.from({ length: 1000 }, (_, i) => `<EntityType Name="E${i}"><Property Name="id"/></EntityType>`).join('') + '</Schema>';
  assert.equal(Object.keys(d._parseEdmxMetadata(large).entityTypes).length, 1000);
});
test('schedule supported simple round trips and day modes preserve explicit boundaries', () => {
  const { instance: d } = detail();
  for (const time of ['0 0 0', '59 59 23', '0 0 12']) {
    const cron = time + ' * * ? * --tz=UTC'; assert.equal(d._scheduleToCron(d._scheduleFromCron(cron)), cron);
  }
  for (const days of [['MON', 'TUE'], ['SAT', 'SUN']]) {
    assert.equal(d._scheduleToCron({ mode: 'day', dayWeekdays: days, dayTime: '00:00', timeZone: 'UTC' }), `0 0 0 ? * ${days.join(',')} * --tz=UTC`);
  }
  assert.equal(d._scheduleToCron({ mode: 'once', onceDate: '2026-09-07', onceTime: '12:00' }), '0 0 12 7 SEP ? 2026');
});
test('save/deploy/run success and failure clear busy and preserve separation', async () => {
  for (const action of ['save', 'deploy', 'run']) for (const fails of [false, true]) {
    const calls = []; const api = {};
    for (const method of ['updateConfigurations', 'deployIntegration', 'triggerImmediateRun']) api[method] = (...args) => { calls.push({ method, args }); return fails ? Promise.reject(new Error('timeout')) : Promise.resolve({ status: 'STARTING' }); };
    const { instance: d, models } = detail({ overrides: { 'integrationpulse/service/BackendClient': api } });
    models.detailView.setProperty('/dirty', true);
    if (action === 'save') d.onSaveDraft(); else if (action === 'deploy') d._doDeploy('name'); else d._doDeployImmediately({ id: 'runtime-id' }, 'name', {});
    await flush(); assert.equal(models.detailView.getProperty('/busy'), false); assert.equal(calls.length, 1);
    assert.equal(calls[0].method, { save: 'updateConfigurations', deploy: 'deployIntegration', run: 'triggerImmediateRun' }[action]);
    if (fails) assert.equal(models.detailView.getProperty('/dirty'), true);
    if (!fails && action !== 'run') { assert.equal(calls[0].args[0], 'design-id'); assert.equal(models.detailView.getProperty('/dirty'), false); }
  }
});
test('Home and Monitoring Detail use the same review store and payload association', () => {
  const h = harness(); const store = h.load('webapp/service/ReviewStore.js');
  const home = h.controller('Home').instance; const mon = h.controller('MonitoringDetail').instance;
  const integration = { id: 'id', name: '技术', sender: 'SAP_HCM', receiver: '' };
  store.setReview(store.getReviewKey('failed', 'id'), '员工 <script> &\n' + 'x'.repeat(5000));
  let row = home._toLastRunRow(integration, fixtures.logs[0], fixtures.logs);
  assert.equal(row.vendor, 'SAP HCM -> Unknown System'); assert.equal(row.integrationName, '技术'); assert.equal(row.underReview, true); assert.equal(row.unresolvedIssues, 1);
  store.setResolved('failed', true); assert.equal(home._toLastRunRow(integration, fixtures.logs[0], fixtures.logs).unresolvedIssues, 0);
  const rows = mon._attachPayloads(fixtures.logs, [{ id: 'first', messageId: 'failed' }, { id: 'second', messageId: 'failed' }], integration);
  assert.equal(rows[0].resolved, true); assert.equal(rows[0].payloadId, 'first'); assert.equal(rows[1].hasPayload, false);
  store.setResolved('failed', false); store.clearReview(store.getReviewKey('failed', 'id'));
  assert.equal(store.isUnderReview(store.getReviewKey('failed', 'id')), false);
  assert.equal(store.countUnresolvedFailed(fixtures.logs), 1);
});
test('review corrupt storage recovers; failed persistence is observable on re-read', () => {
  const h = harness({ localStorage: { getItem: () => '{bad', setItem: () => { throw new Error('quota'); } } });
  const r = h.load('webapp/service/ReviewStore.js'); assert.equal(r.isResolved('id'), false); r.setResolved('id', true);
  assert.equal(r.isResolved('id'), false); assert.ok(h.notices.some(n => n[0].includes('persist')));
});
test('catalog grouping/search/unknown ordering and category switch reset', () => {
  const { instance: c, models } = harness().controller('Integrations');
  const all = [{ id: 'x', name: 'z', sender: 'SAP_HCM', receiver: 'UKG', status: 'STARTED' }, { id: 'y', name: 'a', sender: 'SAP_HCM', receiver: 'UKG', status: 'STOPPED' }, { id: 'u', name: '员工', status: 'ERROR' }, { id: 'draft', status: 'DRAFT' }];
  c._aAllItems = c._prepareRuntimeArtifacts(c._filterRuntimeArtifacts(all)); c._applyGrouping();
  assert.equal(models.integrations.getProperty('/items').length, 3);
  const groups = models.integrationGroups.getProperty('/groups'); assert.equal(groups.at(-1).isUnknown, true); assert.equal(groups[0].items[0].name, 'a');
  assert.equal(c._matchesSearch(all[0], 'sap hcm'), true);
  c.onGroupByChange({ getParameter: () => ({ getKey: () => 'receiver' }) });
  assert.equal(models.view.getProperty('/isGroupSelected'), false);
  assert.equal(models.integrationGroups.getProperty('/groups')[0].title, 'UKG');
});
test('monitoring grouping and KPI empty/mixed totals', () => {
  const { instance: c, models } = harness().controller('Monitoring');
  c._computeKpis([]); assert.equal(models.view.getProperty('/kpi/passPercent'), 0);
  const items = ['passed', 'failed', 'warning'].map((health, i) => ({ name: String(i), health, status: i ? 'STOPPED' : 'STARTED', sourceSystem: 'SAP', targetSystem: 'UKG', messages24h: 2, errors24h: i === 1 ? 1 : 0 }));
  const groups = c._groupSystems(items, false, 'deployedVendors', 'target');
  assert.equal(groups.length, 1); assert.equal(groups[0].passed, 1); assert.equal(groups[0].failed, 1); assert.equal(groups[0].warnings, 1); assert.equal(groups[0].messages24h, 6);
  c._computeKpis(items); assert.equal(models.view.getProperty('/kpi/started'), 1);
});
test('Home fetch mapper bounds concurrency and retains input order', async () => {
  const c = harness().controller('Home').instance; let active = 0, peak = 0;
  const result = await c._mapWithConcurrency(Array.from({ length: 100 }, (_, i) => i), 6, async i => { active++; peak = Math.max(peak, active); await flush(); active--; return i * 2; });
  assert.equal(peak, 6); assert.deepEqual(plain(result), Array.from({ length: 100 }, (_, i) => i * 2));
  assert.deepEqual(plain(await c._mapWithConcurrency([], 6, () => assert.fail())), []);
  await assert.rejects(c._mapWithConcurrency([1], 6, () => Promise.reject(new Error('network'))), /network/);
});
test('payload formatter preserves malformed/raw formats and parses JSON without rendering HTML', () => {
  const { instance: d } = detail();
  assert.equal(d._formatPayload('{"员工":1}', 'application/json'), '{\n  "员工": 1\n}');
  for (const [body, type] of [['{bad', 'application/json'], ['<broken', 'application/xml'], ['a,b\n1,2', 'text/csv'], ['<script>alert(1)</script>', 'text/plain'], ['', '']]) assert.equal(d._formatPayload(body, type), body);
});
defect('QA-03', 'schedule edit loses step interval and weekday selection', () => {
  const { instance: d } = detail(); const cron = '0 0/15 * ? * MON,TUE * --tz=UTC';
  assert.equal(d._scheduleToCron(d._scheduleFromCron(cron)), cron);
});
defect('QA-04', 'encoded baseline filter is corrupted in generated query', () => {
  const d = query('$select=userId&$filter=name%20eq%20%27A%26B%2BC%27', 'newField');
  const result = d._parsePulseQuery(d._getPulseRunOptionsFromDialog().pulseQuery);
  assert.equal(result.filter, "name eq 'A&B+C'");
});
defect('QA-04', 'unchanged encoded filter incorrectly produces a pulse query header', () => {
  const d = query('$select=userId&$filter=name%20eq%20%27A%26B%2BC%27');
  assert.equal(d._getPulseRunOptionsFromDialog().pulseQuery, '');
});
defect('QA-05', 'prototype-named baseline fields silently disappear', () => {
  const d = query('$select=userId,constructor,toString&$expand=__proto__', 'newField');
  const parsed = d._parsePulseQuery(d._getPulseRunOptionsFromDialog().pulseQuery);
  assert.ok(parsed.select.includes('constructor') && parsed.select.includes('toString') && parsed.expand.includes('__proto__'));
});
defect('QA-06', 'late detail load overwrites newer navigation with mixed metadata/configuration', async () => {
  const first = deferred(), second = deferred(); const ids = [];
  const { instance: d, models } = detail({ overrides: { 'integrationpulse/service/BackendClient': { getIntegration: id => id === 'A' ? first.promise : second.promise, getConfigurations: id => { ids.push(id); return Promise.resolve([{ key: 'id', value: id }]); } } } });
  d._sId = 'A'; d._load(); d._sId = 'B'; d._load(); second.resolve({ id: 'B' }); await flush(); first.resolve({ id: 'A' }); await flush();
  assert.equal(models.integration.getProperty('/id'), 'B');
});
defect('QA-07', 'save completion marks a later unsaved edit pristine', async () => {
  const pending = deferred(); let sent;
  const { instance: d, models } = detail({ overrides: { 'integrationpulse/service/BackendClient': { updateConfigurations: (_, configs) => { sent = plain(configs); return pending.promise; } } } });
  d.onSaveDraft(); const param = models.parameters.getProperty('/groups')[0].params[0]; param.value = 'edited while saving';
  pending.resolve({}); await flush(); assert.equal(sent[0].value, 'true');
  d._recomputeDirty(); assert.equal(models.detailView.getProperty('/dirty'), true);
});
defect('QA-08', 'repeated immediate submission sends duplicate requests', async () => {
  const pending = deferred(); let calls = 0;
  const { instance: d } = detail({ overrides: { 'integrationpulse/service/BackendClient': { triggerImmediateRun: () => { calls++; return pending.promise; } } } });
  d._doDeployImmediately({ id: 'id' }, 'name', {}); d._doDeployImmediately({ id: 'id' }, 'name', {});
  pending.resolve({}); await flush(); assert.equal(calls, 1);
});
defect('QA-09', 'malformed EDMX passes regex parsing with usable partial metadata', () => {
  const { instance: d } = detail(); let error;
  try { d._buildEdmxQueryOptions(d._parseEdmxMetadata('<Schema><EntityType Name="EmpJob"><Property Name="id"/></EntityType>'), 'EmpJob'); } catch (e) { error = e; }
  assert.ok(error, 'Unclosed Schema must be rejected');
});
defect('QA-10', 'Monitoring Detail latest run misorders SAP /Date/ timestamps', () => {
  const { instance: c, models } = harness().controller('MonitoringDetail');
  c._summarizeLogs([{ status: 'FAILED', logEnd: '/Date(1000)/' }, { status: 'COMPLETED', logEnd: '/Date(2000)/' }]);
  assert.equal(models.monDetailView.getProperty('/summary/latestStatus'), 'COMPLETED');
});
defect('QA-11', 'Reset leaves immediate-run feature flags stale', () => {
  const { instance: d, models } = detail(); d._findParam('pulse.immediateRunSupported').value = 'false'; d.onParamChange(); d.onReset();
  assert.equal(d._findParamValue('pulse.immediateRunSupported'), 'true');
  assert.equal(models.detailView.getProperty('/immediateRunSupported'), true);
});
