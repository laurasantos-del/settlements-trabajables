from __future__ import annotations

from pydantic import BaseModel, Field


class WebhookPayload(BaseModel):
    objectId: str
    portalId: str | None = None


class Creditor(BaseModel):
    id: str
    name: str
    email: str | None = None
    fax_number: str | None = None
    postal_address: str | None = None


class LOAResult(BaseModel):
    creditor: str
    status: str
    channel: str | None = None
    filename: str | None = None
    queue_id: str | None = None
    error: str | None = None


class Client(BaseModel):
    id: str = Field(alias="client_id")
    name: str
    program_type: str
    active_creditors: list[Creditor]
