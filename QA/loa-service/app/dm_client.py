import httpx

from app.config import settings


def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.dm_api_key}"}


async def get_client(client_id: str) -> dict:
    async with httpx.AsyncClient(base_url=settings.dm_base_url, headers=_headers()) as h:
        r = await h.get(f"/client/{client_id}")
        r.raise_for_status()
        return r.json()


async def get_attachments(client_id: str) -> list[dict]:
    async with httpx.AsyncClient(base_url=settings.dm_base_url, headers=_headers()) as h:
        r = await h.get(f"/client/{client_id}/attachments")
        r.raise_for_status()
        return r.json()


async def download_attachment(attachment_id: str) -> bytes:
    async with httpx.AsyncClient(base_url=settings.dm_base_url, headers=_headers()) as h:
        r = await h.get(f"/attachment/{attachment_id}")
        r.raise_for_status()
        return r.content


async def post_note(client_id: str, creditor_id: str, note_text: str) -> dict:
    async with httpx.AsyncClient(base_url=settings.dm_base_url, headers=_headers()) as h:
        r = await h.post(
            f"/creditor/{creditor_id}/notes",
            json={"client_id": client_id, "note": note_text},
        )
        r.raise_for_status()
        return r.json() if r.content else {}


async def set_status(client_id: str, creditor_id: str, status: str) -> dict:
    async with httpx.AsyncClient(base_url=settings.dm_base_url, headers=_headers()) as h:
        r = await h.put(
            f"/creditor/{creditor_id}/status",
            json={"client_id": client_id, "status": status},
        )
        r.raise_for_status()
        return r.json() if r.content else {}
