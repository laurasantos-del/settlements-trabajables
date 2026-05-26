import httpx

from app.blocker import normalize_creditor_name
from app.config import settings


async def get_creditor_info(creditor_name: str) -> dict:
    if settings.directory_mode == "db":
        raise NotImplementedError("DIRECTORY_MODE=db requiere definir acceso a tabla interna.")

    if not settings.sheets_id or not settings.sheets_api_key:
        return {}

    url = f"https://sheets.googleapis.com/v4/spreadsheets/{settings.sheets_id}/values/A:Z"
    async with httpx.AsyncClient() as h:
        r = await h.get(url, params={"key": settings.sheets_api_key})
        r.raise_for_status()
        values = r.json().get("values", [])

    if not values:
        return {}

    headers = [h.strip() for h in values[0]]
    needle = normalize_creditor_name(creditor_name)
    for row in values[1:]:
        item = {headers[i]: row[i].strip() for i in range(min(len(headers), len(row)))}
        name = item.get("creditor_name") or item.get("name") or item.get("creditor") or ""
        if normalize_creditor_name(name) == needle:
            return item
    return {}
