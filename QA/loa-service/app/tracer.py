import json

from app.dm_client import post_note as dm_note
from app.dm_client import set_status
from app.hs_client import add_note as hs_note


STATUS_MAP = {
    "LOA_SENT": "S20_LOA_SENT",
    "LOA_BLOCKED": None,
    "LOA_ERROR": None,
    "LOA_POSTAL_QUEUED": None,
    "LOA_POSTAL_SENT": "S20_LOA_SENT",
}


async def write_trace(trace: dict, creditor_id: str):
    note_text = (
        f"[{trace['event']}] {trace['timestamp']}\n"
        f"Creditor: {trace['creditor_raw']}\n"
        f"Channel:  {trace.get('channel', '-')}\n"
        f"File:     {trace.get('filename', '-')}\n"
        f"Result:   {trace['result']}"
        + (
            f"\nBlocked by token: '{trace['matched_token']}'"
            if "matched_token" in trace
            else ""
        )
    )

    await dm_note(trace["client_id"], creditor_id, note_text)
    new_status = STATUS_MAP.get(trace["event"])
    if new_status:
        await set_status(trace["client_id"], creditor_id, new_status)

    await hs_note(trace["ticket_hs"], note_text)
