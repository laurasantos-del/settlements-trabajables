import httpx

from app.config import settings


HS_BASE_URL = "https://api.hubapi.com"


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.hs_api_key}",
        "Content-Type": "application/json",
    }


async def get_ticket(ticket_id: str) -> dict:
    async with httpx.AsyncClient(base_url=HS_BASE_URL, headers=_headers()) as h:
        r = await h.get(
            f"/crm/v3/objects/tickets/{ticket_id}",
            params={"properties": "dm_client_id"},
        )
        r.raise_for_status()
        return r.json()


async def update_ticket(ticket_id: str, properties: dict) -> dict:
    async with httpx.AsyncClient(base_url=HS_BASE_URL, headers=_headers()) as h:
        r = await h.patch(
            f"/crm/v3/objects/tickets/{ticket_id}",
            json={"properties": properties},
        )
        r.raise_for_status()
        return r.json()


async def add_note(ticket_id: str, note_text: str) -> dict:
    async with httpx.AsyncClient(base_url=HS_BASE_URL, headers=_headers()) as h:
        note = await h.post(
            "/crm/v3/objects/notes",
            json={"properties": {"hs_note_body": note_text}},
        )
        note.raise_for_status()
        note_id = note.json()["id"]
        assoc = await h.put(
            f"/crm/v3/objects/notes/{note_id}/associations/tickets/{ticket_id}/note_to_ticket",
        )
        assoc.raise_for_status()
        return note.json()


async def send_email_inbox(inbox_id: str, to: str, subject: str, body: str) -> dict:
    async with httpx.AsyncClient(base_url=HS_BASE_URL, headers=_headers()) as h:
        r = await h.post(
            "/conversations/v3/conversations/threads",
            json={
                "inboxId": inbox_id,
                "to": to,
                "subject": subject,
                "body": body,
            },
        )
        r.raise_for_status()
        return r.json() if r.content else {}
