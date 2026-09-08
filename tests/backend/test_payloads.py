import copy
import json
import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from support import main, payload_storage as store, config, transport_patch, deny_http
from fastapi.testclient import TestClient
from routers import payloads

NOW = datetime(2026, 9, 7, 12, 0, tzinfo=timezone.utc)

class PayloadRoutes(unittest.TestCase):
    def setUp(self):
        self.items = {}
        self.client = TestClient(main.app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)
        # Only the persistence boundary is replaced here. SQL construction is
        # independently exercised below; this dictionary is not a PostgreSQL test.
        def create(item): self.items[item['id']] = copy.deepcopy(item); return item
        patches = [transport_patch(deny_http), patch.object(payloads, '_now', return_value=NOW),
                   patch.object(store, 'create_payload', side_effect=create),
                   patch.object(store, 'get_payload', side_effect=lambda key: copy.deepcopy(self.items.get(key))),
                   patch.object(store, 'list_payloads', side_effect=lambda key: [v for v in self.items.values() if v['integrationId'] == key])]
        for p in patches: p.start(); self.addCleanup(p.stop)

    def post(self, body, content_type='text/plain', **params):
        return self.client.post('/payload-api/v1/payloads', params={'integrationId': 'id', **params}, content=body.encode(), headers={'Content-Type': content_type})

    def test_raw_formats_roundtrip_retention_and_download(self):
        for body, kind in [('{"员工":1}', 'application/json'), ('a,b\n1,2', 'text/csv'), ('<r>员工</r>', 'application/xml'), ('<script>alert(1)</script>', 'text/plain'), ('{bad', 'application/json'), ('<bad', 'application/xml'), ('', 'text/plain')]:
            with self.subTest(kind=kind, body=body):
                response = self.post(body, kind, messageId='message', fileName='results.txt')
                self.assertEqual(response.status_code, 200)
                summary = response.json(); self.assertNotIn('payload', summary)
                self.assertEqual(summary['sizeBytes'], len(body.encode()))
                self.assertEqual(datetime.fromisoformat(summary['expiresAt']) - datetime.fromisoformat(summary['createdAt']), timedelta(days=7))
                url = '/payload-api/v1/payloads/' + summary['id']
                self.assertEqual(self.client.get(url).json()['payload'], body)
                download = self.client.get(url + '/download'); self.assertEqual(download.text, body)
                self.assertIn('attachment', download.headers['content-disposition'])

    def test_wrapper_and_header_metadata_and_missing_fields(self):
        wrapper = {'integrationId': 'wrapper', 'messageId': 'm', 'payload': '员工', 'fileName': 'data.txt', 'contentType': 'text/plain'}
        response = self.client.post('/payload-api/v1/payloads', json=wrapper)
        self.assertEqual(response.json()['integrationId'], 'wrapper')
        response = self.client.post('/payload-api/v1/payloads', content=b'abc', headers={'X-Integration-Id': 'header', 'X-Message-Id': 'm'})
        self.assertEqual(response.json()['integrationId'], 'header'); self.assertEqual(response.json()['contentType'], 'text/plain')
        self.assertEqual(self.client.post('/payload-api/v1/payloads', content=b'abc').status_code, 400)
        self.assertEqual(self.client.get('/payload-api/v1/payloads').status_code, 422)
        self.assertEqual(self.client.get('/payload-api/v1/payloads/missing').status_code, 404)
        self.assertEqual(self.client.get('/payload-api/v1/payloads/missing/download').status_code, 404)

    def test_preview_boundary_counts_utf8_bytes_and_hides_large_body(self):
        for body, expected in [('x' * (100 * 1024 - 1), False), ('x' * (100 * 1024), False), ('x' * (100 * 1024 + 1), True), ('员' * 34134, True), ('x' * 1024 * 1024, True)]:
            response = self.post(body).json(); self.assertEqual(response['downloadOnly'], expected)
            detail = self.client.get('/payload-api/v1/payloads/' + response['id']).json()
            self.assertEqual(detail['payload'], None if expected else body)

    def test_duplicate_message_ids_remain_distinct_payloads_and_filenames_are_metadata(self):
        first = self.post('one', messageId='m', fileName='../../escape.txt').json()
        second = self.post('two', messageId='m').json()
        self.assertNotEqual(first['id'], second['id'])
        self.assertEqual(first['fileName'], '../../escape.txt')
        self.assertEqual(len(self.client.get('/payload-api/v1/payloads', params={'integrationId': 'id'}).json()), 2)
        self.assertIsNone(self.post('no message').json()['messageId'])

    def test_storage_and_retrieval_failures_are_not_reported_as_success(self):
        for function, call in [('create_payload', lambda: self.post('body')), ('get_payload', lambda: self.client.get('/payload-api/v1/payloads/id')), ('list_payloads', lambda: self.client.get('/payload-api/v1/payloads?integrationId=id'))]:
            with self.subTest(function=function), patch.object(store, function, side_effect=RuntimeError('database unavailable')):
                self.assertEqual(call().status_code, 502)

    def test_QA_18_unicode_download_filename_must_not_cause_500(self):
        summary = self.post('body', fileName='员工.csv').json()
        self.assertEqual(self.client.get('/payload-api/v1/payloads/' + summary['id'] + '/download').status_code, 200)

    def test_QA_19_crlf_filename_must_not_enter_response_header(self):
        response = self.post('body', fileName='x"\r\nX-Injected: yes')
        if response.status_code >= 400: return
        downloaded = self.client.get('/payload-api/v1/payloads/' + response.json()['id'] + '/download')
        self.assertNotIn('\r', downloaded.headers.get('content-disposition', ''))

class StorageContracts(unittest.TestCase):
    def setUp(self):
        self.connection = MagicMock()
        self.cursor = self.connection.__enter__.return_value.cursor.return_value.__enter__.return_value
        self.p = patch.object(store, '_connect', return_value=self.connection); self.p.start(); self.addCleanup(self.p.stop)
        self.initialized = patch.object(store, '_INITIALIZED', False); self.initialized.start(); self.addCleanup(self.initialized.stop)

    def row(self):
        return dict(id='00000000-0000-0000-0000-000000000001', integration_id='id', message_id='m', file_name='x', content_type='text/plain', size_bytes=4, created_at=NOW, expires_at=NOW + timedelta(days=7), preview_available=True, download_only=False, payload='body')

    def test_schema_once_parameterized_queries_and_expiration_predicates(self):
        self.cursor.fetchall.return_value = [self.row()]
        result = store.list_payloads("id' OR 1=1 --")
        self.assertEqual(len(result), 1); self.assertNotIn('payload', result[0])
        sql_calls = self.cursor.execute.call_args_list
        self.assertTrue(any('expires_at <= NOW()' in c.args[0] for c in sql_calls))
        self.assertIn('expires_at > NOW()', sql_calls[-1].args[0]); self.assertEqual(sql_calls[-1].args[1], ("id' OR 1=1 --",))
        count = sum('CREATE TABLE' in c.args[0] for c in sql_calls)
        store.list_payloads('id'); self.assertEqual(sum('CREATE TABLE' in c.args[0] for c in self.cursor.execute.call_args_list), count)
        self.cursor.fetchone.return_value = self.row(); self.assertEqual(store.get_payload('id')['payload'], 'body')
        self.assertEqual(self.cursor.execute.call_args.args[1], ('id',))
        self.cursor.fetchone.return_value = None; self.assertIsNone(store.get_payload('missing'))

    def test_create_uses_bound_parameters_and_does_not_return_body(self):
        self.cursor.fetchone.return_value = self.row()
        item = store._row_to_payload(self.row()); item['fileName'] = '../../x.txt'
        result = store.create_payload(item)
        self.assertNotIn('payload', result)
        self.assertIs(self.cursor.execute.call_args.args[1], item)
        self.assertTrue(self.connection.__enter__.return_value.commit.called)

    def test_configuration_precedence_binding_and_credential_escaping(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(store.get_database_url(), '')
            with patch.dict(os.environ, {'VCAP_SERVICES': '{bad'}): self.assertEqual(store.get_database_url(), '')
            binding = {'postgresql': [{'name': 'postgres', 'credentials': {'hostname': 'db.test', 'dbname': 'db', 'username': 'a@b', 'password': 'p:/?#'}}]}
            with patch.dict(os.environ, {'VCAP_SERVICES': json.dumps(binding)}):
                self.assertEqual(store.get_database_url(), 'postgresql://a%40b:p%3A%2F%3F%23@db.test:5432/db?sslmode=require')
                with patch.dict(os.environ, {'INTEGRATION_PULSE_PAYLOAD_DATABASE_URL': 'explicit', 'DATABASE_URL': 'generic'}): self.assertEqual(store.get_database_url(), 'explicit')
        with patch.dict(os.environ, {'INTEGRATION_PULSE_USE_MOCK': ' yes ', 'INTEGRATION_PULSE_CORS_ORIGINS': 'a, b,, '}, clear=True):
            settings = config.Settings(); self.assertTrue(settings.use_mock); self.assertEqual(settings.cors_origins, ['a', 'b'])

    def test_database_failure_does_not_mark_initialization_complete(self):
        self.cursor.execute.side_effect = RuntimeError('database failed')
        with self.assertRaises(RuntimeError): store.init_db()
        self.assertFalse(store._INITIALIZED)
