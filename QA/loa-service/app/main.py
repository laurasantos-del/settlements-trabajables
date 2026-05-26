import hashlib
import hmac

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request

from app.config import settings
from app.orchestrator import process_ticket


app = FastAPI(title="LOA Automation Service")


@app.post("/webhook")
async def hubspot_webhook(request: Request, background_tasks: BackgroundTasks):
    body = await request.body()
    sig = request.headers.get("X-Hub-Signature", "")
    expected = hmac.new(
        settings.hs_webhook_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    background_tasks.add_task(process_ticket, payload)
    return {"status": "accepted"}


@app.post("/webhook/postal/approve")
async def postal_approve(request: Request):
    from app.postal import postal_approve as do_approve

    body = await request.json()
    return await do_approve(body["queue_id"])
