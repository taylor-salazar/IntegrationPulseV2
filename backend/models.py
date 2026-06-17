"""Pydantic request/response schemas shared across the API.

These are the contract the SAPUI5 frontend (webapp/service/BackendClient.js)
depends on. Keep them stable; map BTP's OData shapes into these in btp_client.py.
"""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class Integration(BaseModel):
    id: str
    name: str
    packageName: str = ""
    version: str = ""
    status: str = "STOPPED"
    description: str = ""
    parameterCount: int = 0
    lastDeployed: Optional[str] = None


class Configuration(BaseModel):
    key: str
    label: str = ""
    value: str = ""
    defaultValue: str = ""
    dataType: str = "xsd:string"
    secure: bool = False
    readOnly: bool = False


class ConfigurationUpdate(BaseModel):
    """A single edited parameter coming back from the UI."""

    key: str
    value: str


class ConfigurationUpdateRequest(BaseModel):
    configurations: List[ConfigurationUpdate] = Field(default_factory=list)


class DeployResponse(BaseModel):
    id: str
    status: str
    taskId: Optional[str] = None


class MonitoringItem(BaseModel):
    id: str
    name: str
    packageName: str = ""
    endpoint: str = ""
    status: str = "STOPPED"
    messages24h: int = 0
    errors24h: int = 0
    lastDeployed: Optional[str] = None


class MessageLog(BaseModel):
    messageId: str
    status: str
    sender: str = ""
    logEnd: Optional[str] = None
    durationMs: int = 0
    errorMessage: str = ""
