import os
import unittest
from unittest.mock import patch
from support import main
from fastapi.testclient import TestClient
from test_security import ENV, token
from routers import payloads


class PayloadSecurity(unittest.TestCase):
    def setUp(self):
        p=patch.dict(os.environ,{**ENV,'PULSE_PAYLOAD_MAX_BYTES':'128'});p.start();self.addCleanup(p.stop)
        self.client=TestClient(main.app);self.addCleanup(self.client.close)

    def headers(self,machine=True):
        return {'Authorization':'Bearer '+token('pulse.Payload.Ingest' if machine else 'pulse.Administrator',machine)}

    def test_authentication_precedes_size_and_stream_limit(self):
        with patch.object(payloads.payload_storage,'create_payload') as store:
            self.assertEqual(self.client.post('/payload-api/v1/payloads',content=b'x'*129).status_code,401)
            self.assertEqual(self.client.post('/payload-api/v1/payloads',headers=self.headers(),content=b'x'*129).status_code,413)
            self.assertEqual(self.client.post('/payload-api/v1/payloads?integrationId=id',headers=self.headers(),content=iter([b'x'*80,b'x'*80])).status_code,413)
            store.assert_not_called()

    def test_trusted_ownership_and_foreign_id_not_found(self):
        saved=[]
        def create(item): saved.append(item);return item
        with patch.object(payloads.payload_storage,'create_payload',side_effect=create):
            result=self.client.post('/payload-api/v1/payloads',headers=self.headers(),json={'integrationId':'id','payload':'summary','tenantId':'foreign'})
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(saved[0]['tenantId'],'tenant-a');self.assertEqual(saved[0]['ingestedByClientId'],'machine')
        self.assertNotIn('tenantId',result.json())
        with patch.object(payloads.payload_storage,'get_payload',return_value=None) as lookup:
            for suffix in ['', '/download']:
                result=self.client.get('/payload-api/v1/payloads/foreign'+suffix,headers=self.headers(False))
                self.assertEqual(result.status_code,404);self.assertEqual(result.headers['cache-control'],'no-store')
                lookup.assert_called_with('foreign','tenant-a')
