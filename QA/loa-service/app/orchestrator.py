from datetime import datetime, timezone

from app.blocker import blocked_match
from app.dm_client import get_attachments, get_client, post_note, set_status
from app.document import fetch_loa, rename_pdf
from app.hs_client import add_note, get_ticket, update_ticket
from app.postal import enqueue_postal
from app.router import resolve_channel, send_email, send_fax
from app.tracer import write_trace


async def process_ticket(payload: dict):
    ticket_id = payload["objectId"]
    ticket = await get_ticket(ticket_id)
    client_id = ticket["properties"]["dm_client_id"]
    client = await get_client(client_id)
    creditors = client["active_creditors"]
    all_done = []

    for creditor in creditors:
        raw_name = creditor["name"]

        token = blocked_match(raw_name)
        if token:
            await write_trace(
                {
                    "event": "LOA_BLOCKED",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "client_id": client_id,
                    "ticket_hs": ticket_id,
                    "creditor_raw": raw_name,
                    "matched_token": token,
                    "channel": "blocked",
                    "result": "No document downloaded. No send attempted.",
                },
                creditor_id=creditor["id"],
            )
            all_done.append({"creditor": raw_name, "status": "blocked"})
            continue

        channel = await resolve_channel(creditor)
        if channel == "none":
            await write_trace(
                {
                    **base_trace(client_id, ticket_id, raw_name),
                    "event": "LOA_ERROR",
                    "channel": "none",
                    "result": "No valid delivery channel found. Manual review required.",
                },
                creditor_id=creditor["id"],
            )
            all_done.append({"creditor": raw_name, "status": "error_no_channel"})
            continue

        pdf_bytes = await fetch_loa(client_id, client["program_type"], creditor["id"])
        if not pdf_bytes:
            await write_trace(
                {
                    **base_trace(client_id, ticket_id, raw_name),
                    "event": "LOA_ERROR",
                    "channel": channel,
                    "result": "Document not found in DM. Manual review required.",
                },
                creditor_id=creditor["id"],
            )
            all_done.append({"creditor": raw_name, "status": "error_no_doc"})
            continue

        filename = rename_pdf(client_id, client["name"], raw_name, datetime.now())

        if channel == "email":
            await send_email(creditor, pdf_bytes, filename, client)
        elif channel == "fax":
            await send_fax(creditor, pdf_bytes, filename, client)
        elif channel == "postal":
            await enqueue_postal(creditor, pdf_bytes, filename, client, ticket_id)
            all_done.append({"creditor": raw_name, "status": "postal_queued"})
            continue

        await write_trace(
            {
                **base_trace(client_id, ticket_id, raw_name),
                "event": "LOA_SENT",
                "channel": channel,
                "filename": filename,
                "result": f"LOA sent via {channel}.",
            },
            creditor_id=creditor["id"],
        )
        all_done.append({"creditor": raw_name, "status": "sent", "channel": channel})

    pending_postal = any(x["status"] == "postal_queued" for x in all_done)
    if not pending_postal:
        await update_ticket(ticket_id, {"hs_pipeline_stage": "closedwon"})
        await add_note(
            ticket_id,
            "LOA fue enviado a sus acreedores. Ver notas en DM para detalle.",
        )


def base_trace(client_id, ticket_id, raw_name):
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "client_id": client_id,
        "ticket_hs": ticket_id,
        "creditor_raw": raw_name,
    }
