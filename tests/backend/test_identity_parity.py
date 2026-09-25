"""Same identity scenarios as the retained UI destination reference."""
import json
import re
import unittest
from pathlib import Path
from support import btp_client as btp, httpx, transport_patch
from models import Integration

CASES = json.loads((Path(__file__).parents[1] / 'fixtures/identity-parity.json').read_text())


class IdentityParity(unittest.IsolatedAsyncioTestCase):
    async def test_shared_identity_scenarios(self):
        for case in CASES:
            with self.subTest(case=case['name']):
                def handler(request):
                    if request.url.host == 'oauth.test':
                        return httpx.Response(200, json={'access_token':'synthetic-token','expires_in':300})
                    if '$filter' in request.url.params:
                        rows = case['package'] if request.url.params['$filter'].startswith('PackageId') else []
                        return httpx.Response(200, json={'d':{'results':rows}})
                    match = re.search(r"Id='((?:''|[^'])*)',Version='((?:''|[^'])*)'", request.url.path)
                    if match:
                        artifact, version = [s.replace("''", "'") for s in match.groups()]
                        for entry in case['direct']:
                            if entry['id'] == artifact and entry['requested'] == version:
                                return httpx.Response(entry.get('status',200), json={'d':entry})
                    return httpx.Response(404)
                with transport_patch(handler):
                    item = Integration(**case['item'])
                    if case['error']:
                        with self.assertRaisesRegex(Exception, case['error']): await btp.resolve_identity(item.id,item)
                    else:
                        actual = await btp.resolve_identity(item.id,item)
                        self.assertEqual({'id':actual.designTimeId,'version':actual.designTimeVersion},case['expected'])
