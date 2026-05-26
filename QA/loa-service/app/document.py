from __future__ import annotations

import io
from datetime import datetime

import pypdf

from app.dm_client import download_attachment, get_attachments


PAGE_BY_PROGRAM = {
    "DS": 7,
    "DFUSA-N": 7,
    "DF-CFLN": 4,
}


async def fetch_loa(client_id: str, program_type: str, creditor_id: str) -> bytes | None:
    attachments = await get_attachments(client_id)

    direct = next(
        (
            a
            for a in attachments
            if "LOA" in a["filename"].upper() or "POA" in a["filename"].upper()
        ),
        None,
    )
    if direct:
        return await download_attachment(direct["id"])

    enrollment = next(
        (a for a in attachments if "ENROLLMENT" in a["filename"].upper()),
        None,
    )
    if not enrollment:
        return None

    pdf_bytes = await download_attachment(enrollment["id"])
    page_idx = PAGE_BY_PROGRAM.get(program_type, 7)
    return extract_page(pdf_bytes, page_idx)


def extract_page(pdf_bytes: bytes, page_idx: int) -> bytes:
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    writer = pypdf.PdfWriter()
    writer.add_page(reader.pages[page_idx])
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def rename_pdf(client_id: str, client_name: str, creditor_name: str, date: datetime) -> str:
    def slug(s):
        return s.strip().replace(" ", "-")

    return (
        f"LOA-{client_id}-{slug(client_name)}"
        f"-{slug(creditor_name)}-{date.strftime('%Y.%m.%d')}.pdf"
    )
