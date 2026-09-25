"""Show-by-default redaction using explicit deployment rules, not guessed SAP fields."""
import fnmatch
import json
import os
from fastapi import HTTPException


def sensitive(key: str) -> bool:
    try:
        patterns = json.loads(os.getenv('PULSE_SENSITIVE_FIELDS', '[]'))
        if not isinstance(patterns, list) or any(not isinstance(p, str) for p in patterns):
            raise ValueError()
    except ValueError:
        raise HTTPException(503, 'Sensitive-field policy is invalid') from None
    return any(fnmatch.fnmatchcase(key, pattern) for pattern in patterns)


def for_principal(rows, principal):
    result = []
    for row in rows:
        hidden = sensitive(row.key)
        # No live SAP sensitivity metadata is assumed: current mappings only
        # establish ParameterKey, ParameterValue, DataType. Mock secure flags
        # are not evidence of a production SAP metadata contract.
        values = {'secure': row.secure or hidden}
        if hidden and not principal.administrator:
            values.update(value=None, defaultValue='', redacted=True, readOnly=True)
        result.append(row.model_copy(update=values))
    return result
