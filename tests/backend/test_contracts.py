import asyncio
import json
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from urllib.parse import unquote

from support import auth, btp_client as btp, config, main, httpx, FIXTURES, transport_patch, deny_http, sap_response
from fastapi.testclient import TestClient
from models import ConfigurationUpdate
from errors import InvalidUpstreamResponse

class Contracts(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.guard = transport_patch(deny_http); self.guard.start(); self.addCleanup(self.guard.stop)
        self.mode = patch.object(config.SETTINGS, 'use_mock', False); self.mode.start(); self.addCleanup(self.mode.stop)
        auth._token_cache.update(token=None, exp=0)

    async def test_runtime_catalog_mapping_and_literal_roundtrips(self):
        calls = []
        def handler(r): calls.append(r); return sap_response(r)
        with transport_patch(handler):
            rows = await btp.list_integrations()
        self.assertEqual(len(rows), 1); self.assertEqual(rows[0].id, 'runtime-id')
        self.assertEqual(rows[0].designTimeId, 'design-id'); self.assertEqual(rows[0].version, '1.0')
        self.assertTrue(rows[0].isRuntimeArtifact)
        self.assertEqual(len(calls), 2)
        for value in FIXTURES['sensitiveIds']:
            self.assertEqual(unquote(btp._odata_literal(value)), "'" + value.replace("'", "''") + "'")

    async def test_save_batch_then_deploy_and_no_runtime_call(self):
        calls = []
        def handler(r): calls.append(r); return sap_response(r)
        values = [ConfigurationUpdate(key="a'b/%", value='员工\n<script>&+%000', dataType='custom')]
        with transport_patch(handler): result = await btp.deploy_integration('runtime-id', values)
        self.assertEqual(result.status, 'STARTING'); self.assertEqual(result.taskId, 'task-1')
        mutations = [r for r in calls if r.method == 'POST' and r.url.host != 'oauth.test']
        self.assertEqual(len(mutations), 2); self.assertTrue(mutations[0].url.path.endswith('/$batch'))
        body = mutations[0].content.decode(); parts = [json.loads(line) for line in body.split('\r\n') if line.startswith('{')]
        self.assertEqual(parts[0], {'ParameterKey': values[0].key, 'ParameterValue': values[0].value, 'DataType': 'custom'})
        self.assertIn("Id='design-id'", unquote(body)); self.assertIn('DeployIntegrationDesigntimeArtifact', str(mutations[1].url))
        self.assertFalse(any('/http/' in str(r.url) for r in calls))

    async def test_inner_batch_failure_blocks_deploy(self):
        calls = []
        def handler(r):
            calls.append(r)
            return httpx.Response(202, text='HTTP/1.1 409 Conflict') if r.url.path.endswith('/$batch') else sap_response(r)
        with transport_patch(handler), self.assertRaises(httpx.HTTPStatusError):
            await btp.deploy_integration('runtime-id', [ConfigurationUpdate(key='a', value='b')])
        self.assertFalse(any('DeployIntegrationDesigntimeArtifact' in str(r.url) for r in calls))

    async def test_immediate_run_normalization_headers_and_separation(self):
        for endpoint in ['/run', 'run', '/http/run']:
            for pulse in ['', '$select=userId,companyNav/name&$expand=companyNav']:
                with self.subTest(endpoint=endpoint, pulse=pulse):
                    calls = []
                    def handler(r): calls.append(r); return sap_response(r)
                    with transport_patch(handler): result = await btp.trigger_immediate_run('id', endpoint, entity='EmpJob', pulse_query=pulse)
                    run = calls[-1]; self.assertEqual(str(run.url), 'https://sap.test/http/run'); self.assertEqual(run.content, b'{}')
                    self.assertEqual(run.headers['pulse.entity'], 'EmpJob'); self.assertEqual(result.status, 'TRIGGERED')
                    for name in ['filter.pulseQuery', 'filter-pulseQuery', 'X-Pulse-Query']:
                        self.assertEqual(run.headers.get(name), pulse or None)
                    self.assertEqual(len([r for r in calls if r.url.host == 'sap.test']), 1)

    async def test_configurations_real_resolution_and_failure_diagnostics(self):
        with transport_patch(sap_response):
            rows = await btp.get_configurations('runtime-id'); self.assertEqual(rows[0].value, '员工\n000&+%')
        def missing(r):
            return httpx.Response(404, text='not found') if 'IntegrationDesigntimeArtifacts' in str(r.url) else sap_response(r)
        with transport_patch(missing), self.assertRaisesRegex(RuntimeError, 'Integration design time artifact not found'):
            await btp.get_configurations('runtime-id')

    async def test_http_failures_and_timeouts_do_not_retry_mutations(self):
        for code in [400, 401, 403, 404, 409, 429, 500, 503]:
            for action in ['save', 'deploy', 'run']:
                with self.subTest(code=code, action=action):
                    mutations = []
                    def handler(r):
                        if r.method == 'POST' and r.url.host == 'sap.test':
                            mutations.append(r); return httpx.Response(code, text='upstream failure')
                        return sap_response(r)
                    with transport_patch(handler), self.assertRaises(httpx.HTTPStatusError):
                        if action == 'run': await btp.trigger_immediate_run('id', '/run')
                        elif action == 'save': await btp.update_configurations('runtime-id', [ConfigurationUpdate(key='a', value='b')])
                        else: await btp.deploy_integration('runtime-id', [])
                    self.assertEqual(len(mutations), 1)
        def timeout(r): raise httpx.ReadTimeout('qa timeout', request=r)
        with transport_patch(timeout), self.assertRaises(httpx.ReadTimeout): await btp.list_integrations()

    async def test_get_malformed_and_empty_upstream_json_fail(self):
        for content in [b'', b'{broken']:
            def handler(r): return sap_response(r) if r.url.host == 'oauth.test' else httpx.Response(200, content=content)
            with self.subTest(content=content), transport_patch(handler), self.assertRaises(InvalidUpstreamResponse): await btp.list_integrations()

    async def test_oauth_cache_refresh_and_failure(self):
        calls = []
        def handler(r): calls.append(r); return sap_response(r)
        with patch('auth.time.time', return_value=1000), transport_patch(handler):
            self.assertEqual(await auth.get_access_token(), 'qa-dummy-token'); await auth.get_access_token()
        self.assertEqual(len(calls), 1); self.assertIn(b'grant_type=client_credentials', calls[0].content)
        self.assertTrue(calls[0].headers['authorization'].startswith('Basic '))
        with patch('auth.time.time', return_value=4540), transport_patch(handler): await auth.get_access_token()
        self.assertEqual(len(calls), 2)
        auth._token_cache.update(token=None, exp=0)
        with transport_patch(lambda r: httpx.Response(401)), self.assertRaises(httpx.HTTPStatusError): await auth.get_access_token()
        self.assertIsNone(auth._token_cache['token'])
        with patch.object(config.SETTINGS, 'oauth_token_url', ''), self.assertRaises(RuntimeError): await auth.get_access_token()

    async def test_mock_fixture_contracts_and_nonpersistent_writes(self):
        with patch.object(config.SETTINGS, 'use_mock', True):
            integration_id = 'SF_EC_to_Vendor_Employee_File'
            configs = await btp.get_configurations(integration_id)
            await btp.update_configurations(integration_id, [ConfigurationUpdate(key='a', value='b')])
            self.assertEqual(await btp.get_configurations(integration_id), configs)
            await btp.list_monitoring(); await btp.get_message_logs(integration_id)
            self.assertEqual((await btp.deploy_integration(integration_id, [])).status, 'STARTING')
            self.assertEqual((await btp.trigger_immediate_run(integration_id)).status, 'TRIGGERED')

    async def test_QA_20_shipped_mock_catalog_must_satisfy_response_schema(self):
        error = None
        with patch.object(config.SETTINGS, 'use_mock', True):
            try: await btp.list_integrations()
            except ValueError as exc: error = str(exc)
        self.assertIsNone(error, error)

    async def test_QA_12_proxy_log_filter_double_encodes_sensitive_id(self):
        calls = []
        def handler(r): calls.append(r); return sap_response(r)
        with transport_patch(handler): await btp.get_message_logs("Space O'Brien/%+&")
        self.assertEqual(calls[-1].url.params['$filter'], "IntegrationFlowName eq 'Space O''Brien/%+&'")

    async def test_QA_13_proxy_forwards_token_to_arbitrary_endpoint(self):
        calls = []
        def handler(r): calls.append(r); return httpx.Response(200, json={'access_token': 'qa-dummy-token'})
        with transport_patch(handler):
            try: await btp.trigger_immediate_run('id', 'https://untrusted.test/collect')
            except (RuntimeError, ValueError): pass
        # MockTransport captures the request. No connection to this host occurs.
        self.assertFalse(any(r.url.host == 'untrusted.test' and 'authorization' in r.headers for r in calls))

    async def test_QA_14_unresolved_proxy_identity_must_block_deploy(self):
        calls = []
        def handler(r):
            calls.append(r)
            if 'IntegrationDesigntimeArtifacts' in str(r.url): return httpx.Response(404)
            return sap_response(r)
        with transport_patch(handler):
            try: await btp.deploy_integration('runtime-id', [])
            except RuntimeError: pass
        self.assertFalse(any('DeployIntegrationDesigntimeArtifact?' in str(r.url) for r in calls))

class Routes(unittest.TestCase):
    def setUp(self):
        auth._token_cache.update(token=None, exp=0)
        self.guard = transport_patch(deny_http); self.guard.start(); self.addCleanup(self.guard.stop)
        self.mode = patch.object(config.SETTINGS, 'use_mock', False); self.mode.start(); self.addCleanup(self.mode.stop)
        self.client = TestClient(main.app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)

    def test_real_routes_to_btp_to_mock_http(self):
        with transport_patch(sap_response):
            for url in ['/api/integrations', '/api/integrations/runtime-id', '/api/integrations/runtime-id/configurations', '/api/monitoring', '/api/monitoring/runtime-id', '/api/monitoring/runtime-id/logs']:
                with self.subTest(url=url): self.assertEqual(self.client.get(url).status_code, 200)
            self.assertEqual(self.client.put('/api/integrations/runtime-id/configurations', json={'configurations': [{'key': 'a', 'value': '员工'}]}).json()['updated'], 1)
            self.assertEqual(self.client.post('/api/integrations/runtime-id/deploy', json={'configurations': []}).json()['status'], 'STARTING')
            self.assertEqual(self.client.post('/api/integrations/runtime-id/trigger', json={'endpoint': '/run', 'pulseQuery': '$select=a'}).json()['status'], 'TRIGGERED')
            self.assertEqual(self.client.get('/api/integrations/missing').status_code, 404)

    def test_validation_health_cors_and_csp(self):
        self.assertEqual(self.client.get('/health').json(), {'status': 'ok', 'mock': False})
        for body in [None, {'configurations': [{'key': 'a'}]}, {'configurations': [{'key': 'a', 'value': None}]}, {'configurations': 'bad'}]:
            with self.subTest(body=body): self.assertEqual(self.client.put('/api/integrations/id/configurations', json=body).status_code, 422)
        self.assertEqual(self.client.post('/api/integrations/id/trigger', json={'endpoint': []}).status_code, 422)
        allowed = self.client.options('/api/integrations', headers={'Origin': 'http://localhost:8080', 'Access-Control-Request-Method': 'GET'})
        self.assertEqual(allowed.headers['access-control-allow-origin'], 'http://localhost:8080')
        denied = self.client.options('/api/integrations', headers={'Origin': 'https://untrusted.test', 'Access-Control-Request-Method': 'GET'})
        self.assertNotIn('access-control-allow-origin', denied.headers)
        self.assertEqual(self.client.get('/health').headers['content-security-policy'], "frame-ancestors 'self';")

    def test_QA_15_upstream_failure_should_be_controlled_gateway_error(self):
        with transport_patch(lambda r: httpx.Response(503, text='upstream unavailable')):
            response = self.client.get('/api/integrations')
        self.assertIn(response.status_code, [502, 503, 504])

    def test_QA_16_encoded_slash_id_should_reach_integration_route(self):
        def handler(r):
            if r.url.path.endswith('/IntegrationRuntimeArtifacts'): return httpx.Response(200, json={'d': {'results': [{'Id': 'a/b', 'Name': 'a/b'}]}})
            return sap_response(r)
        with transport_patch(handler): response = self.client.get('/api/integrations/a%2Fb')
        self.assertEqual(response.status_code, 200)

    def test_QA_17_live_monitoring_should_not_claim_zero_when_logs_exist(self):
        captured_at = datetime.now(timezone.utc).isoformat()
        def handler(r):
            if r.url.path.endswith('/MessageProcessingLogs'):
                return httpx.Response(200, json={'d': {'results': [{'MessageGuid': 'recent', 'Status': 'COMPLETED', 'LogEnd': captured_at}]}})
            return sap_response(r)
        with transport_patch(handler):
            logs = self.client.get('/api/monitoring/runtime-id/logs').json()
            rows = self.client.get('/api/monitoring').json()
        self.assertTrue(logs)
        self.assertEqual(rows[0]['messages24h'], 1, 'A completed run just now must be counted in the last 24 hours')
