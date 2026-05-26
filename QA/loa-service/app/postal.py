import base64
import json
import uuid
from pathlib import Path

import httpx

from app.config import settings


QUEUE_FILE = Path("/tmp/postal_queue.json")


def _load_queue() -> dict:
    if not QUEUE_FILE.exists():
        return {}
    return json.loads(QUEUE_FILE.read_text())


def _save_queue(q: dict):
    QUEUE_FILE.write_text(json.dumps(q, indent=2))


async def enqueue_postal(creditor, pdf_bytes, filename, client, ticket_id) -> str:
    queue_id = str(uuid.uuid4())
    q = _load_queue()
    q[queue_id] = {
        "queue_id": queue_id,
        "ticket_hs": ticket_id,
        "client_id": client["id"],
        "client_name": client["name"],
        "creditor": creditor["name"],
        "filename": filename,
        "pdf_b64": base64.b64encode(pdf_bytes).decode(),
        "address": creditor.get("postal_address", ""),
        "status": "pending",
    }
    _save_queue(q)
    if settings.postal_queue_webhook:
        async with httpx.AsyncClient() as h:
            await h.post(
                settings.postal_queue_webhook,
                json={
                    "text": (
                        f"LOA postal pendiente: {client['name']} -> "
                        f"{creditor['name']}. queue_id: {queue_id}"
                    )
                },
            )
    return queue_id


async def postal_approve(queue_id: str) -> dict:
    q = _load_queue()
    item = q.get(queue_id)
    if not item or item["status"] != "pending":
        return {"error": "queue_id not found or already processed"}

    pdf_bytes = base64.b64decode(item["pdf_b64"])
    job_id = await _create_letterstream_job(item, pdf_bytes)

    item["status"] = "sent"
    item["job_id"] = job_id
    q[queue_id] = item
    _save_queue(q)
    return {"status": "sent", "job_id": job_id}


async def _create_letterstream_job(item: dict, pdf_bytes: bytes) -> str:
    raise NotImplementedError("Implementar con LetterStream API docs")
