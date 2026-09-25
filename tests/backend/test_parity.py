import json
import os
import unittest
from unittest.mock import patch, AsyncMock
from support import ROOT, btp_client as btp, config, httpx, transport_patch, sap_response
from destination_client import Destination
from errors import InvalidRuntimeEndpoint

PARITY=json.loads((ROOT/'tests/fixtures/parity.json').read_text())


class Parity(unittest.IsolatedAsyncioTestCase):
    async def test_shared_catalog_and_monitoring_fixture(self):
        def handler(r):
            if r.url.path.endswith('/IntegrationRuntimeArtifacts'): return httpx.Response(200,json={'d':{'results':[PARITY['runtime']]}})
            if '/IntegrationDesigntimeArtifacts(' in str(r.url): return httpx.Response(200,json={'d':PARITY['design']})
            if r.url.path.endswith('/MessageProcessingLogs'): return httpx.Response(200,json={'d':{'results':PARITY['logs']}})
            return sap_response(r)
        with patch.object(config.SETTINGS,'use_mock',False),transport_patch(handler):
            catalog=await btp.list_integrations(enrich=True); logs=await btp.get_message_logs('runtime-id')
        self.assertEqual({k:getattr(catalog[0],k) for k in PARITY['expected']},PARITY['expected'])
        self.assertEqual([v.model_dump() for v in logs],[PARITY['expectedLog']])

    async def test_runtime_uses_separate_token_and_binds_endpoint(self):
        calls=[]
        def handler(r): calls.append(r); return httpx.Response(202)
        with patch.object(config.SETTINGS,'use_mock',False),patch.object(config.SETTINGS,'sap_transport','destination'),patch.dict(os.environ,{'PULSE_RUNTIME_ENDPOINTS':'{"id":"/http/run"}'}),patch.object(btp.destination_client,'resolve',AsyncMock(return_value=Destination('https://runtime.test','Bearer runtime-only'))),transport_patch(handler):
            await btp.trigger_immediate_run('id','/run',entity='EmpJob',pulse_query='$select=userId')
            self.assertEqual(calls[0].headers['authorization'],'Bearer runtime-only')
            for endpoint in ['/other','https://evil.test/http/run','/http/%252e%252e/run']:
                with self.assertRaises(InvalidRuntimeEndpoint): await btp.trigger_immediate_run('id',endpoint)
        self.assertEqual(len(calls),1)
