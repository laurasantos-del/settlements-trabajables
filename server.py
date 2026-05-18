import json
from datetime import datetime
from typing import Any, Dict, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="DebtFreedom Data Receiver")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

store: Dict[str, List[Any]] = {
    "client_savings_escrow": [],
    "negotiator_escrow": [],
    "debtmanager": [],
}

connected_clients: List[WebSocket] = []


@app.websocket("/ws/data")
async def websocket_data(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    print(f"[WS] Cliente conectado - {websocket.client}")
    try:
        while True:
            raw = await websocket.receive_text()
            payload = json.loads(raw)
            source = payload.get("source", "debtmanager")
            event = payload.get("event")
            data = payload.get("data", {})
            ts = payload.get("timestamp", datetime.utcnow().isoformat())

            if event == "ping":
                await websocket.send_text(json.dumps({"event": "pong", "ts": ts}))
                continue

            if event == "batch":
                records = data if isinstance(data, list) else [data]
                sub_report = records[0].get("_report", "") if records else ""
                bucket = sub_report if sub_report in store else ("debtmanager" if source not in store else source)
                store[bucket].extend(records)
                count = len(store[bucket])
                print(f"  [{bucket}] +{len(records)} registros -> total: {count}")
                await websocket.send_text(
                    json.dumps(
                        {
                            "event": "ack",
                            "source": source,
                            "bucket": bucket,
                            "count": count,
                        }
                    )
                )

            elif event == "done":
                report_name = data.get("report", source)
                bucket = report_name if report_name in store else "debtmanager"
                total = len(store.get(bucket, []))
                print(f"  [{bucket}] Finalizado - {total} registros totales")
                await websocket.send_text(
                    json.dumps(
                        {
                            "event": "done_ack",
                            "source": source,
                            "bucket": bucket,
                            "total": total,
                        }
                    )
                )

    except WebSocketDisconnect:
        if websocket in connected_clients:
            connected_clients.remove(websocket)
        print("[WS] Cliente desconectado")


@app.get("/data/client-savings-escrow")
def get_client_savings():
    data = store["client_savings_escrow"]
    return {"report": "CLIENT SAVINGS/ESCROW REPORT", "count": len(data), "records": data}


@app.get("/data/negotiator-escrow")
def get_negotiator_escrow():
    data = store["negotiator_escrow"]
    return {"report": "NEGOTIATOR/ESCROW REPORT", "count": len(data), "records": data}


@app.get("/data/summary")
def summary():
    return {
        "client_savings_escrow": len(store["client_savings_escrow"]),
        "negotiator_escrow": len(store["negotiator_escrow"]),
        "debtmanager": len(store["debtmanager"]),
        "last_updated": datetime.utcnow().isoformat(),
    }


@app.delete("/data/clear")
def clear_all():
    for key in store:
        store[key].clear()
    return {"message": "Store limpiado"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
