import httpx

from app.config import settings
from app.directory import get_creditor_info


async def resolve_channel(creditor: dict) -> str:
    info = await get_creditor_info(creditor["name"])
    if info.get("email"):
        return "email"
    if info.get("fax_number"):
        return "fax"
    if info.get("letterstream"):
        return "postal"
    return "none"


async def send_email(creditor, pdf_bytes, filename, client):
    info = await get_creditor_info(creditor["name"])
    async with httpx.AsyncClient() as h:
        await h.post(
            "https://api.hubapi.com/conversations/v3/conversations/threads",
            headers={"Authorization": f"Bearer {settings.hs_api_key}"},
            json={
                "inboxId": settings.hs_inbox_set,
                "to": info["email"],
                "subject": f"[{client['id']}] {client['name']} - {creditor['name']}",
                "body": build_email_body(client, creditor),
            },
        )


async def send_fax(creditor, pdf_bytes, filename, client):
    info = await get_creditor_info(creditor["name"])
    fax_num = info["fax_number"].replace("-", "").replace(" ", "")
    async with httpx.AsyncClient() as h:
        await h.post(
            "https://api.hubapi.com/conversations/v3/conversations/threads",
            headers={"Authorization": f"Bearer {settings.hs_api_key}"},
            json={
                "inboxId": settings.hs_inbox_cs_email,
                "to": f"{fax_num}@fax.1bluerock.com",
                "subject": f"[{client['id']}] {client['name']} - {creditor['name']} - LOA",
                "body": build_email_body(client, creditor),
            },
        )


def build_email_body(client, creditor) -> str:
    return (
        "Please find attached the Letter of Authorization (LOA) / "
        f"Power of Attorney (POA) for {client['name']} "
        f"for {creditor['name']}.\n\n"
        "Creditor Services\nDebt Freedom USA\n"
        "Consumer Defense Partners\n1.800.854.3030\nFax: 407.442.2XXX"  # TODO: completar número de fax
    )
