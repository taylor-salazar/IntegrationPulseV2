"""Pydantic request/response schemas shared across the API.

These are the contract the SAPUI5 frontend (webapp/service/BackendClient.js)
depends on. Keep them stable; map BTP's OData shapes into these in btp_client.py.
"""
from __future__ import annotations

from typing import List, Optional, Literal

from pydantic import BaseModel, Field, model_validator, ConfigDict


class Integration(BaseModel):
    id: str
    name: str
    designTimeId: str = ""
    designTimeVersion: str = ""
    identity: Optional[dict] = None
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
    value: Optional[str] = ""
    defaultValue: str = ""
    dataType: str = "xsd:string"
    secure: bool = False
    readOnly: bool = False
    redacted: bool = False


class ArtifactIdentity(BaseModel):
    runtimeId: str
    designTimeId: str
    designTimeVersion: str
    packageId: str = ""


class ConfigurationUpdate(BaseModel):
    """A single edited parameter coming back from the UI."""

    key: str
    value: str
    dataType: str = "xsd:string"
    action: Literal["set", "clear"] = "set"
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def explicit_edit(self):
        if self.action == "clear" and self.value != "":
            raise ValueError("Clear requires an empty value")
        if self.action == "set" and (not self.value or self.value.lower() in {"[redacted]", "<redacted>", "[masked]"}
                                     or (len(self.value) >= 3 and set(self.value) <= {"*", "•"})):
            raise ValueError("Set requires an explicit non-masked value; use clear to clear")
        return self


class ConfigurationUpdateRequest(BaseModel):
    configurations: List[ConfigurationUpdate] = Field(default_factory=list)
    identity: Optional[ArtifactIdentity] = None
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def unique_changes(self):
        keys = [item.key for item in self.configurations]
        if len(keys) != len(set(keys)):
            raise ValueError("Each changed parameter must occur exactly once")
        return self


class DeployResponse(BaseModel):
    id: str
    status: str
    taskId: Optional[str] = None


class ImmediateRunRequest(BaseModel):
    endpoint: Optional[str] = None
    entity: str = ""
    filterQuery: str = ""
    pulseQuery: str = ""
    model_config = ConfigDict(extra="forbid")


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
