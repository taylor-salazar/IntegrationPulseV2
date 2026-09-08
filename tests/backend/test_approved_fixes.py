import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from support import auth, btp_client as btp, config, main, httpx, transport_patch, deny_http, sap_response
from fastapi.testclient import TestClient
from errors import InvalidRuntimeEndpoint, InvalidUpstreamResponse

NOW = datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc)


class FixedDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW


class ApprovedFixes(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        for p in [transport_patch(deny_http), patch.object(config.SETTINGS, 'use_mock', False)]:
            p.start(); self.addCleanup(p.stop)
        auth._token_cache.update(token=None, exp=0)

    async def test_untrusted_endpoints_are_rejected_before_oauth(self):
        for endpoint in ['https://untrusted.test/http/run', 'http://sap.test/http/run',
                         '//untrusted.test/http/run', 'https://user@sap.test/http/run',
                         'https://sap.test:444/http/run', 'https://sap.test/api/v1',
                         '/http/../api/v1', '/http/%2e%2e/api/v1', '/http/%252e%252e/api/v1',
                         '/http/%2f..%2fapi/v1', '/http/run\\..\\admin',
                         '/http/run%0d%0aX:yes', 'https://[broken', '/http/', '/http/run#fragment']:
            with self.subTest(endpoint=endpoint), self.assertRaises(InvalidRuntimeEndpoint):
                await btp.trigger_immediate_run('id', endpoint)
            self.assertIsNone(auth._token_cache['token'])

    async def test_configured_runtime_origin_and_header_validation(self):
        calls = []
        def handler(r): calls.append(r); return sap_response(r)
        with patch.object(config.SETTINGS, 'immediate_run_base', 'https://runtime.test'), transport_patch(handler):
            await btp.trigger_immediate_run('id', 'https://runtime.test/http/run')
        self.assertEqual(str(calls[-1].url), 'https://runtime.test/http/run')
        self.assertEqual(calls[-1].headers['authorization'], 'Bearer qa-dummy-token')
        for pulse in ['line\r\nbreak', '员工']:
            with self.subTest(pulse=pulse), self.assertRaises(InvalidRuntimeEndpoint):
                await btp.trigger_immediate_run('id', '/http/run', pulse_query=pulse)

    async def test_recent_counts_include_exact_24h_boundary_dedupe_and_paginate(self):
        since = NOW - timedelta(hours=24)
        def log(message, stamp, status='COMPLETED'):
            return {'MessageGuid': message, 'LogEnd': stamp, 'Status': status}
        boundary = log('boundary', since.isoformat(), 'FAILED')
        calls = []
        def handler(r):
            calls.append(r)
            if r.url.path.endswith('/MessageProcessingLogs'):
                if '$skiptoken' in r.url.params:
                    return httpx.Response(200, json={'d': {'results': [boundary, log('now', NOW.isoformat())]}})
                return httpx.Response(200, json={'d': {'results': [
                    boundary, log('old', (since - timedelta(milliseconds=1)).isoformat()),
                    log('future', (NOW + timedelta(milliseconds=1)).isoformat()),
                    log('invalid', 'not a date'), log('discard', NOW.isoformat(), 'DISCARDED'),
                    log('offset', '2026-09-08T07:00:00-04:00'),
                    log('sap', f'/Date({int(NOW.timestamp()*1000)})/', 'FAILED')],
                    '__next': 'https://sap.test/api/v1/MessageProcessingLogs?$skiptoken=next'}})
            return sap_response(r)
        with patch.object(btp, 'datetime', FixedDateTime), transport_patch(handler):
            rows = await btp.list_monitoring()
        self.assertEqual(rows[0].messages24h, 4); self.assertEqual(rows[0].errors24h, 2)
        logs = [r for r in calls if r.url.path.endswith('/MessageProcessingLogs')]
        self.assertEqual(len(logs), 2)
        self.assertIn("LogEnd ge datetime'2026-09-07T12:00:00'", logs[0].url.params['$filter'])

    async def test_bad_page_links_and_failed_logs_do_not_report_zero(self):
        for next_url in ['https://untrusted.test/api/v1/MessageProcessingLogs', '/api/v1/IntegrationRuntimeArtifacts', 'https://[broken', 123]:
            def handler(r):
                if r.url.path.endswith('/MessageProcessingLogs'):
                    return httpx.Response(200, json={'d': {'results': [], '__next': next_url}})
                return sap_response(r)
            with self.subTest(next_url=next_url), transport_patch(handler), self.assertRaises(InvalidUpstreamResponse):
                await btp.list_monitoring()
        def unavailable(r):
            return httpx.Response(503) if r.url.path.endswith('/MessageProcessingLogs') else sap_response(r)
        with transport_patch(unavailable), self.assertRaises(httpx.HTTPStatusError): await btp.list_monitoring()

    async def test_query_identity_routes_support_reserved_suffixes_for_every_action(self):
        with TestClient(main.app) as client, transport_patch(sap_response):
            for integration_id in ['a/b', 'a/configurations', "O'Brien%+&员工", 'by-id']:
                with self.subTest(integration_id=integration_id):
                    response = client.get('/api/integrations/by-id/configurations', params={'integrationId': integration_id})
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(client.put('/api/integrations/by-id/configurations', params={'integrationId': integration_id}, json={'configurations': []}).status_code, 200)
                    self.assertEqual(client.post('/api/integrations/by-id/deploy', params={'integrationId': integration_id}, json={'configurations': []}).status_code, 200)
                    self.assertEqual(client.post('/api/integrations/by-id/trigger', params={'integrationId': integration_id}, json={'endpoint': '/http/run'}).json()['id'], integration_id)
                    self.assertEqual(client.get('/api/monitoring/by-id/logs', params={'integrationId': integration_id}).status_code, 200)

    async def test_gateway_errors_are_structured_and_do_not_expose_upstream_body(self):
        with TestClient(main.app, raise_server_exceptions=False) as client:
            for code, expected in [(401, 502), (403, 502), (404, 502), (429, 503), (500, 502), (503, 503)]:
                with self.subTest(code=code), transport_patch(lambda r: httpx.Response(code, text='SECRET FROM UPSTREAM')):
                    response = client.get('/api/integrations')
                    self.assertEqual(response.status_code, expected)
                    self.assertNotIn('SECRET', response.text); self.assertIn('detail', response.json())
            def timeout(r): raise httpx.ReadTimeout('secret request URL', request=r)
            with transport_patch(timeout): self.assertEqual(client.get('/api/integrations').status_code, 504)
            with transport_patch(lambda r: httpx.Response(200, text='{broken')):
                self.assertEqual(client.get('/api/integrations').status_code, 502)
            response = client.post('/api/integrations/by-id/trigger?integrationId=id', json={'endpoint': 'https://untrusted.test/http/run'})
            self.assertEqual(response.status_code, 400)

    async def test_empty_or_malformed_identity_never_mutates(self):
        for body in [{}, {'d': {}}, {'d': {'Id': ''}}, {'d': {'Id': 123}}, {'d': {'Id': ['invalid']}}]:
            calls = []
            def handler(r):
                calls.append(r)
                if '/IntegrationDesigntimeArtifacts(' in str(r.url): return httpx.Response(200, json=body)
                return sap_response(r)
            with self.subTest(body=body), transport_patch(handler), self.assertRaises(InvalidUpstreamResponse):
                await btp.deploy_integration('runtime-id', [])
            self.assertFalse(any('DeployIntegrationDesigntimeArtifact?' in str(r.url) for r in calls))
