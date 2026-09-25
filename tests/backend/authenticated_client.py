"""Legacy API contract tests now use real signed synthetic role tokens.

Security tests deliberately use the ordinary unauthenticated TestClient instead.
No authentication override is installed in the application.
"""
import os
from unittest.mock import patch
from fastapi.testclient import TestClient as BaseClient
from test_security import ENV, token


class TestClient(BaseClient):
    def request(self, method, url, **kwargs):
        machine = method.upper() == 'POST' and str(url).split('?')[0] == '/payload-api/v1/payloads'
        headers = dict(kwargs.pop('headers', {}) or {})
        headers.setdefault('Authorization', 'Bearer ' + token('pulse.Payload.Ingest' if machine else 'pulse.Administrator', machine))
        with patch.dict(os.environ, ENV):
            return super().request(method, url, headers=headers, **kwargs)
