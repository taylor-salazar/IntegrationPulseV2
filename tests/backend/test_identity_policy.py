import os
import unittest
from unittest.mock import patch, AsyncMock
from support import btp_client as btp, config, httpx, transport_patch, sap_response
from models import ConfigurationUpdate, Configuration
from configuration_policy import for_principal
from security import Principal
from errors import InvalidUpstreamResponse


class IdentityPolicy(unittest.IsolatedAsyncioTestCase):
    async def test_credential_lookup_404_is_not_artifact_fallback(self):
        from models import Integration
        from fastapi import HTTPException
        request = httpx.Request('GET', 'https://destination.test/missing')
        error = httpx.HTTPStatusError('synthetic', request=request, response=httpx.Response(404, request=request))
        with patch.object(btp, '_management_connection', new=AsyncMock(side_effect=error)) as connection:
            with self.assertRaisesRegex(HTTPException, 'credential resolution failed'):
                await btp.resolve_identity('id', Integration(id='id',name='id'))
            self.assertEqual(connection.await_count, 1)

    async def test_active_returns_concrete_identity_and_reuses_it_for_configuration(self):
        calls=[]
        def handler(r): calls.append(r); return sap_response(r)
        with patch.object(config.SETTINGS,'use_mock',False), transport_patch(handler):
            identity=await btp.resolve_identity('runtime-id')
            await btp.get_configurations('runtime-id')
        self.assertEqual((identity.runtimeId,identity.designTimeId,identity.designTimeVersion),('runtime-id','design-id','2.0'))
        self.assertIn("Version='2.0'", str(calls[-1].url))

    async def test_authorization_and_availability_are_not_not_found(self):
        for code in [401,403,429,503]:
            def handler(r):
                if 'IntegrationDesigntimeArtifacts' in str(r.url): return httpx.Response(code)
                return sap_response(r)
            with patch.object(config.SETTINGS,'use_mock',False), transport_patch(handler):
                with self.assertRaises(httpx.HTTPStatusError) as caught: await btp.resolve_identity('runtime-id')
            self.assertEqual(caught.exception.response.status_code,code)

    async def test_package_fallback_and_ambiguity(self):
        for multiple in [False,True]:
            def handler(r):
                if 'IntegrationDesigntimeArtifacts' not in str(r.url): return sap_response(r)
                if "Id='found'" in str(r.url): return httpx.Response(200,json={'d':{'Id':'found','Version':'3'}})
                if 'PackageId' in r.url.params.get('$filter',''):
                    rows=[{'Id':'found','Version':'3'}]+([{'Id':'other','Version':'4'}] if multiple else [])
                    return httpx.Response(200,json={'d':{'results':rows}})
                if '$filter' in r.url.params: return httpx.Response(200,json={'d':{'results':[]}})
                return httpx.Response(404)
            with patch.object(config.SETTINGS,'use_mock',False), transport_patch(handler):
                if multiple:
                    with self.assertRaisesRegex(InvalidUpstreamResponse,'Ambiguous'): await btp.resolve_identity('runtime-id')
                else: self.assertEqual((await btp.resolve_identity('runtime-id')).designTimeId,'found')

    def test_show_default_redaction_and_explicit_clear(self):
        rows=[Configuration(key='ordinary',value='visible'),Configuration(key='credential',value='synthetic',defaultValue='synthetic-default')]
        with patch.dict(os.environ,{'PULSE_SENSITIVE_FIELDS':'["credential"]'}):
            values=for_principal(rows,Principal('t','u',False,True))
            self.assertEqual(values[0].value,'visible');self.assertIsNone(values[1].value)
            self.assertEqual(values[1].defaultValue,'');self.assertTrue(values[1].redacted)
            self.assertEqual(for_principal(rows,Principal('t','u',False,True,True))[1].value,'synthetic')
        for value in ['', '********','[redacted]']:
            with self.assertRaises(ValueError): ConfigurationUpdate(key='credential',value=value)
        self.assertEqual(ConfigurationUpdate(key='credential',value='',action='clear').value,'')
