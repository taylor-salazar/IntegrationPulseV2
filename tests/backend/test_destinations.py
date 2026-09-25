import json
import os
import unittest
from unittest.mock import patch
from support import httpx, transport_patch
import destination_client as dc
from errors import InvalidUpstreamResponse


class Destinations(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        credentials = {'uri':'https://dest.test', 'url':'https://dest-auth.test', 'clientid':'dest-client', 'clientsecret':'synthetic'}
        env = {'PULSE_MANAGEMENT_DESTINATION':'management', 'PULSE_RUNTIME_DESTINATION':'runtime',
               'VCAP_SERVICES':json.dumps({'destination':[{'name':'pulse-destination','credentials':credentials}]})}
        p = patch.dict(os.environ, env); p.start(); self.addCleanup(p.stop)

    async def test_separate_server_selected_tokens(self):
        calls = []
        def handler(request):
            calls.append(request)
            if request.url.host == 'dest-auth.test': return httpx.Response(200, json={'access_token':'service-token'})
            purpose = request.url.path.rsplit('/',1)[1]
            return httpx.Response(200,json={'destinationConfiguration':{'Type':'HTTP','Authentication':'OAuth2ClientCredentials','URL':'https://sap.test' + ('/api/v1' if purpose=='management' else '')}, 'authTokens':[{'type':'Bearer','value':purpose+'-token','expires_in':'300'}]})
        with transport_patch(handler):
            mgmt = await dc.resolve('management'); run = await dc.resolve('runtime')
        self.assertNotEqual(mgmt.authorization, run.authorization)
        self.assertEqual(calls[1].headers['authorization'], 'Bearer service-token')
        self.assertEqual(calls[3].url.path.rsplit('/',1)[1], 'runtime')
        with self.assertRaises(ValueError): await dc.resolve('browser-choice')

    async def test_bad_url_auth_and_redirect_rejected(self):
        for url in ['http://sap.test/api/v1','https://user:pass@sap.test/api/v1','https://sap.test/api/v1#bad']:
            with self.assertRaises(InvalidUpstreamResponse): dc.https_url(url)
        with transport_patch(lambda r: httpx.Response(302,headers={'location':'https://evil.test'})):
            with self.assertRaises(httpx.HTTPStatusError): await dc.resolve('management')
        with patch.dict(os.environ, {'PULSE_RUNTIME_DESTINATION':'management'}):
            with self.assertRaises(InvalidUpstreamResponse): await dc.resolve('management')

    async def test_destination_rejects_user_auth_and_invalid_technical_tokens(self):
        from copy import deepcopy
        base = {'destinationConfiguration': {'Type':'HTTP', 'Authentication':'OAuth2ClientCredentials', 'URL':'https://sap.test/api/v1'},
                'authTokens':[{'type':'Bearer', 'value':'technical-token', 'expires_in':300}]}
        cases = []
        for authentication in ['BasicAuthentication', 'OAuth2UserTokenExchange', 'NoAuthentication']:
            case = deepcopy(base); case['destinationConfiguration']['Authentication'] = authentication; cases.append(case)
        for changes in [{'expires_in':0}, {'expires_in':'NaN'}, {'error':'token acquisition failed'}, {'value':'bad\r\nheader'}, {'type':'Basic'}]:
            case = deepcopy(base); case['authTokens'][0].update(changes); cases.append(case)
        for case in cases:
            def handler(request):
                return httpx.Response(200, json={'access_token':'service-token'} if request.url.host == 'dest-auth.test' else case)
            with transport_patch(handler):
                with self.assertRaises(InvalidUpstreamResponse): await dc.resolve('management')
