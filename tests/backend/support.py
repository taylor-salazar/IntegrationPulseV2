"""Test-only setup: disable dotenv, replace tenant settings, deny unmocked HTTP."""
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
os.environ['PYTHON_DOTENV_DISABLED'] = '1'
sys.path.insert(0, str(ROOT / 'backend'))
import config
config.SETTINGS = config.Settings(
    use_mock=True, is_api_base='https://sap.test/api/v1',
    immediate_run_base='', oauth_token_url='https://oauth.test/token',
    client_id='qa-client', client_secret='qa-dummy-secret',
    cors_origins=['http://localhost:8080'], frame_ancestors=["'self'"],
)
import auth
import btp_client
import main
import payload_storage
import httpx

FIXTURES = json.loads((ROOT / 'tests/fixtures/contracts.json').read_text(encoding='utf8'))
REAL_ASYNC_CLIENT = httpx.AsyncClient

def transport_patch(handler):
    def factory(*args, **kwargs):
        kwargs['transport'] = httpx.MockTransport(handler)
        return REAL_ASYNC_CLIENT(*args, **kwargs)
    return patch('httpx.AsyncClient', side_effect=factory)

def deny_http(request):
    raise AssertionError('Unmocked HTTP boundary: ' + str(request.url))

def sap_response(request, **kwargs):
    url = str(request.url)
    if request.url.host == 'oauth.test':
        return httpx.Response(200, json={'access_token': 'qa-dummy-token', 'expires_in': 3600})
    if request.url.path.endswith('/IntegrationRuntimeArtifacts'):
        return httpx.Response(200, json={'d': {'results': [FIXTURES['runtime']]}})
    if request.url.params.get('$filter') is not None and '/IntegrationDesigntimeArtifacts' in url:
        return httpx.Response(200, json={'d': {'results': [FIXTURES['design']]}})
    if request.url.path.endswith('/Configurations'):
        return httpx.Response(200, json={'d': {'results': [{'ParameterKey': 'filter.query', 'ParameterValue': '员工\n000&+%', 'DataType': 'xsd:string'}]}})
    if '/IntegrationDesigntimeArtifacts(' in url:
        return httpx.Response(200, json={'d': FIXTURES['design']})
    if request.url.path.endswith('/$batch'):
        return httpx.Response(202, text='HTTP/1.1 204 No Content')
    if '/DeployIntegrationDesigntimeArtifact?' in url:
        return httpx.Response(202, text='task-1')
    if request.url.path.startswith('/http/'):
        return httpx.Response(202)
    if request.url.path.endswith('/MessageProcessingLogs'):
        return httpx.Response(200, json={'d': {'results': [{'MessageGuid': 'm', 'Status': 'COMPLETED', 'LogEnd': '/Date(1000)/'}]}})
    raise AssertionError('Unexpected SAP request: ' + str(request.url))
