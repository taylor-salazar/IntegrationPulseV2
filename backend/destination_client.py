"""Resolve only the two server-selected SAP technical destinations.

No user token is accepted here. Destination-service credentials acquire the
service token; destination authTokens supply the independent SAP credentials.
"""
from dataclasses import dataclass
import os
import math
from urllib.parse import quote, urlsplit
import httpx
from security import binding
from errors import InvalidUpstreamResponse


@dataclass(frozen=True)
class Destination:
    url: str
    authorization: str


def https_url(value: str) -> str:
    try:
        p = urlsplit(value)
        if (p.scheme != 'https' or not p.hostname or p.username or p.password
                or p.query or p.fragment or '\\' in value
                or any(ord(c) < 33 or ord(c) == 127 for c in value)):
            raise ValueError()
        _ = p.port
        return value.rstrip('/')
    except (ValueError, TypeError):
        raise InvalidUpstreamResponse('Invalid configured destination URL') from None


async def resolve(purpose: str) -> Destination:
    if purpose not in {'management', 'runtime'}:
        raise ValueError('Unknown server destination purpose')
    names = {key: os.getenv('PULSE_' + key.upper() + '_DESTINATION', '') for key in ('management', 'runtime')}
    if not all(names.values()) or names['management'] == names['runtime']:
        raise InvalidUpstreamResponse('Separate management and runtime destinations must be configured')
    credentials = binding('destination', os.getenv('PULSE_DESTINATION_SERVICE', 'pulse-destination'))
    service_url = https_url(credentials.get('uri', ''))
    token_url = https_url(credentials.get('url', '')) + '/oauth/token'
    if not credentials.get('clientid') or not credentials.get('clientsecret'):
        raise InvalidUpstreamResponse('Destination service credentials are unavailable')
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
        response = await client.post(token_url, data={'grant_type': 'client_credentials'},
                                     auth=(credentials['clientid'], credentials['clientsecret']))
        response.raise_for_status()
        try:
            access_token = response.json()['access_token']
            if not isinstance(access_token, str) or not access_token or any(c.isspace() for c in access_token):
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            raise InvalidUpstreamResponse('Invalid destination service token response') from None
        response = await client.get(service_url + '/destination-configuration/v1/destinations/' + quote(names[purpose], safe=''),
                                    headers={'Authorization': 'Bearer ' + access_token, 'Accept': 'application/json'})
        response.raise_for_status()
        try:
            data = response.json()
            config = data['destinationConfiguration']
            if config.get('Type') != 'HTTP' or config.get('Authentication') != 'OAuth2ClientCredentials' or config.get('ProxyType', 'Internet') != 'Internet':
                raise ValueError()
            url = https_url(config['URL'])
            if purpose == 'management' and not urlsplit(url).path.endswith('/api/v1'):
                raise ValueError()
            tokens = data['authTokens']
            if not isinstance(tokens, list) or len(tokens) != 1 or tokens[0].get('error'):
                raise ValueError()
            token = tokens[0]
            expires = float(token.get('expires_in', 0))
            if str(token.get('type', '')).lower() != 'bearer' or not math.isfinite(expires) or expires <= 0:
                raise ValueError()
            value = token['value']
            if not isinstance(value, str) or not value or any(c.isspace() for c in value):
                raise ValueError()
            return Destination(url, 'Bearer ' + value)
        except (ValueError, KeyError, TypeError):
            raise InvalidUpstreamResponse('Invalid OAuth client-credentials destination response') from None
