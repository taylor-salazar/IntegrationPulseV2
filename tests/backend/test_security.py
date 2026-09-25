"""Signed synthetic JWTs exercise the real SAP validator and HTTP boundary."""
import json
import os
import time
import unittest
from unittest.mock import patch, AsyncMock

from support import main
from fastapi.testclient import TestClient
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
import jwt

KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PUBLIC = KEY.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
CREDENTIALS = {"clientid": "pulse-client", "clientsecret": "synthetic-only", "url": "https://issuer.test",
               "verificationkey": PUBLIC, "xsappname": "pulse", "identityzoneid": "zone"}
ENV = {"VCAP_SERVICES": json.dumps({"xsuaa": [{"name": "pulse-auth", "credentials": CREDENTIALS}]}),
       "PULSE_JWT_ISSUER": "https://issuer.test/oauth/token", "PULSE_TENANT_ID": "tenant-a", "PULSE_INGEST_CLIENT_IDS": "machine"}


def token(scope="pulse.Viewer", machine=False, **changes):
    claims = {"iss": ENV["PULSE_JWT_ISSUER"], "zid": "zone", "cid": "machine" if machine else "pulse-client",
              "aud": ["pulse"], "exp": int(time.time()) + 300, "iat": int(time.time()),
              "grant_type": "client_credentials" if machine else "authorization_code", "scope": [scope],
              "user_name": "synthetic-user"}
    claims.update(changes)
    return jwt.encode(claims, KEY, algorithm="RS256")


class SecurityBoundary(unittest.TestCase):
    def setUp(self):
        p = patch.dict(os.environ, ENV); p.start(); self.addCleanup(p.stop)
        self.client = TestClient(main.app); self.addCleanup(self.client.close)

    def call(self, tok, path="/api/session", method="GET", **kwargs):
        return self.client.request(method, path, headers={"Authorization": "Bearer " + tok}, **kwargs)

    def test_anonymous_and_untrusted_identity_headers(self):
        self.assertEqual(self.client.get('/api/session', headers={'X-User': 'admin'}).status_code, 401)
        self.assertEqual(self.client.get('/api/session?access_token=' + token()).status_code, 401)

    def test_human_capabilities_and_denials(self):
        result = self.call(token()); self.assertEqual(result.status_code, 200, result.text)
        self.assertFalse(result.json()['capabilities']['administer'])
        self.assertEqual(result.headers['cache-control'], 'no-store')
        self.assertEqual(self.call(token('other')).status_code, 403)
        self.assertTrue(self.call(token('pulse.Administrator')).json()['capabilities']['readPayloads'])
        for path in ['/api/integrations/id/deploy', '/api/integrations/by-id/trigger?integrationId=id']:
            self.assertEqual(self.call(token(), path, 'POST', json={}).status_code, 403)
        self.assertEqual(self.call(token(), '/payload-api/v1/payloads?integrationId=id').status_code, 403)

    def test_machine_and_human_privileges_are_disjoint(self):
        self.assertEqual(self.call(token('pulse.Administrator', True)).status_code, 403)
        self.assertEqual(self.call(token('pulse.Payload.Ingest'), '/payload-api/v1/payloads', 'POST').status_code, 403)
        self.assertEqual(self.call(token('pulse.Payload.Ingest', True, cid='unregistered'), '/payload-api/v1/payloads', 'POST').status_code, 403)
        # Authorized machine reaches input validation, not storage.
        self.assertEqual(self.call(token('pulse.Payload.Ingest', True), '/payload-api/v1/payloads', 'POST').status_code, 400)

    def test_redaction_applies_to_http_body_and_defaults(self):
        from models import Configuration
        rows = [Configuration(key='ordinary', value='visible'),
                Configuration(key='credential', value='synthetic-private', defaultValue='synthetic-default')]
        with patch.dict(os.environ, {'PULSE_SENSITIVE_FIELDS':'["credential"]'}), patch('btp_client.get_configurations', new=AsyncMock(return_value=rows)):
            result = self.call(token(), '/api/integrations/by-id/configurations?integrationId=id')
            self.assertEqual(result.status_code, 200, result.text)
            self.assertNotIn('synthetic-', result.text)
            self.assertEqual(result.json()[0]['value'], 'visible')
            self.assertTrue(result.json()[1]['redacted'])
            self.assertEqual(result.headers['cache-control'], 'no-store')
            admin = self.call(token('pulse.Administrator'), '/api/integrations/id/configurations')
            self.assertEqual(admin.json()[1]['value'], 'synthetic-private')

    def test_invalid_tokens(self):
        for changes in [{'iss':'https://evil.test'}, {'zid':'foreign'}, {'exp':1}, {'aud':['foreign']}, {'aud':['foreign'], 'cid':'foreign'}, {'exp':None}]:
            with self.subTest(changes=changes): self.assertEqual(self.call(token(**changes)).status_code, 401)
        wrong_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        claims = jwt.decode(token(), options={'verify_signature':False})
        self.assertEqual(self.call(jwt.encode(claims, wrong_key, algorithm='RS256')).status_code, 401)
        self.assertEqual(self.call(jwt.encode(claims, 'synthetic-only', algorithm='HS256')).status_code, 401)
