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
    isRuntimeArtifact: bool = True
    sender: str = ""
    receiver: str = ""
    endpoint: str = ""


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
    dataType: str = "xsd:string"


class ConfigurationUpdateRequest(BaseModel):
    configurations: List[ConfigurationUpdate] = Field(default_factory=list)


class DeployResponse(BaseModel):
    id: str
    status: str
    taskId: Optional[str] = None


class ImmediateRunRequest(BaseModel):
    endpoint: Optional[str] = None
    entity: str = ""
    selectQuery: str = ""
    expandQuery: str = ""
    filterQuery: str = ""


class ImmediateRunResponse(BaseModel):
    id: str
    status: str = "TRIGGERED"
    message: str = ""


class MonitoringItem(BaseModel):
    id: str
    name: str
    packageName: str = ""
    endpoint: str = ""
    status: str = "STOPPED"
    sender: str = ""
    receiver: str = ""
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


class PayloadCreateRequest(BaseModel):
    integrationId: str
    messageId: Optional[str] = None
    fileName: str = "payload.txt"
    contentType: str = "text/plain"
    payload: str


class PayloadSummary(BaseModel):
    id: str
    integrationId: str
    messageId: Optional[str] = None
    fileName: str
    contentType: str = "text/plain"
    sizeBytes: int = 0
    createdAt: str
    expiresAt: str
    previewAvailable: bool = True
    downloadOnly: bool = False


class PayloadDetail(PayloadSummary):
    payload: Optional[str] = None
