import json
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, MetaData, String, Table, Text, create_engine, delete, func, insert, select


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
    "client_interactions": [],
    "expected_client_payments": [],
    "settlement_payment_report": [],
    "new_enrollments": [],
    "settlements_per_date": [],
    "payments_cleared": [],
    "commissions": [],
    "projected_fees": [],
    "payment_nsf": [],
    "summary_report": [],
    "suspended_payments": [],
    "creditor_status": [],
    "debtmanager": [],
}

DATA_FILE = Path("debtmanager_store.json")
DB_FILE = Path("settlements.db")
FONDOS_MINIMO = 40

engine = create_engine(f"sqlite:///{DB_FILE}", connect_args={"check_same_thread": False})
metadata = MetaData()
settlements_table = Table(
    "settlements",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("fecha", String, index=True, nullable=False),
    Column("client_id", String),
    Column("client_name", String),
    Column("sid", String),
    Column("client_status", String),
    Column("escrow", String),
    Column("deudas_listas", Text),
    Column("deudas_pendientes", Text),
    Column("creado_en", String, nullable=False),
)
metadata.create_all(bind=engine)


def load_store_from_disk():
    if not DATA_FILE.exists():
        return
    try:
        saved = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return
    for key in store:
        if isinstance(saved.get(key), list):
            store[key] = saved[key]


def save_store_to_disk():
    DATA_FILE.write_text(json.dumps(store, ensure_ascii=False), encoding="utf-8")


load_store_from_disk()

connected_clients: List[WebSocket] = []


def clean_text(value):
    return str(value or "").strip()


def money_to_number(value):
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = (
        str(value or "")
        .replace("$", "")
        .replace(",", "")
        .replace("%", "")
        .strip()
    )
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = f"-{cleaned[1:-1]}"
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def row_value(row, *names):
    lowered = {clean_text(key).lower(): value for key, value in row.items()}
    for name in names:
        value = lowered.get(name.lower())
        if value not in (None, ""):
            return value
    return ""


def build_savings_index():
    index = {}
    for row in store["client_savings_escrow"]:
        key = clean_text(
            row_value(row, "Client ID", "ClientServiceID")
            or row_value(row, "Sid")
            or row_value(row, "Client Name")
        ).lower()
        if not key:
            continue
        current_month = money_to_number(row_value(row, "Current Month Available"))
        next_month = money_to_number(row_value(row, "Next Month Available"))
        next_month_2 = money_to_number(row_value(row, "Next Month Available 2"))
        index[key] = {
            "client_balance": money_to_number(row_value(row, "Client Balance")),
            "escrow": max(current_month, next_month, next_month_2),
        }
    return index


def build_settlement_clients():
    savings_index = build_savings_index()
    clients = {}

    for row in store["negotiator_escrow"]:
        status = clean_text(row_value(row, "Client Status"))
        if status and status.lower() != "active":
            continue

        client_id = clean_text(row_value(row, "Client ID"))
        client_name = clean_text(row_value(row, "Client Name"))
        sid = clean_text(row_value(row, "Sid"))
        key = (client_id or sid or client_name).lower()
        if not key:
            continue

        balance = money_to_number(row_value(row, "Current Account Balance", "Original Balance"))
        escrow = money_to_number(row_value(row, "Available Funds In Escrow Account"))
        if balance <= 0:
            continue

        percent = (escrow / balance) * 100 if balance else 0
        if percent < FONDOS_MINIMO:
            continue

        client = clients.setdefault(
            key,
            {
                "client_id": client_id,
                "client_name": client_name or "(cliente)",
                "sid": sid,
                "client_status": status or "Active",
                "escrow": escrow,
                "deudas_listas": [],
                "deudas_pendientes": [],
            },
        )
        client["client_id"] = client["client_id"] or client_id
        client["client_name"] = client["client_name"] or client_name
        client["sid"] = client["sid"] or sid
        client["client_status"] = client["client_status"] or status
        client["escrow"] = max(money_to_number(client["escrow"]), escrow)

        debt = {
            "creditor": clean_text(row_value(row, "Collection Agency", "Original Creditor")) or "(acreedor)",
            "originalCreditor": clean_text(row_value(row, "Original Creditor")),
            "collectionAgency": clean_text(row_value(row, "Collection Agency")),
            "balance": balance,
            "percent": percent,
        }
        if percent >= 100:
            client["deudas_listas"].append(debt)
        else:
            client["deudas_pendientes"].append(debt)

    for row in store["client_savings_escrow"]:
        client_id = clean_text(row_value(row, "Client ID", "ClientServiceID"))
        client_name = clean_text(row_value(row, "Client Name"))
        sid = clean_text(row_value(row, "Sid"))
        key = (client_id or sid or client_name).lower()
        if not key or key in clients:
            continue
        savings = savings_index.get(key, {})
        clients[key] = {
            "client_id": client_id,
            "client_name": client_name or "(cliente)",
            "sid": sid,
            "client_status": "",
            "escrow": savings.get("escrow", 0),
            "deudas_listas": [],
            "deudas_pendientes": [],
        }

    return list(clients.values())


def save_settlements_report(report_date=None):
    clients = build_settlement_clients()
    if not clients:
        return 0

    fecha = report_date or date.today().isoformat()
    creado_en = datetime.utcnow().isoformat()
    rows = [
        {
            "fecha": fecha,
            "client_id": client["client_id"],
            "client_name": client["client_name"],
            "sid": client["sid"],
            "client_status": client["client_status"],
            "escrow": str(client["escrow"]),
            "deudas_listas": json.dumps(client["deudas_listas"], ensure_ascii=False),
            "deudas_pendientes": json.dumps(client["deudas_pendientes"], ensure_ascii=False),
            "creado_en": creado_en,
        }
        for client in clients
    ]
    with engine.begin() as connection:
        connection.execute(delete(settlements_table).where(settlements_table.c.fecha == fecha))
        connection.execute(insert(settlements_table), rows)
    return len(rows)


def settlement_row_to_client(row):
    mapping = row._mapping
    listas = json.loads(mapping["deudas_listas"] or "[]")
    pendientes = json.loads(mapping["deudas_pendientes"] or "[]")
    debts = listas + pendientes
    return {
        "id": mapping["id"],
        "fecha": mapping["fecha"],
        "clientId": mapping["client_id"],
        "client": mapping["client_name"],
        "sid": mapping["sid"],
        "clientStatus": mapping["client_status"],
        "escrow": money_to_number(mapping["escrow"]),
        "debts": debts,
        "readyDebts": listas,
        "pendingDebts": pendientes,
    }


def latest_report_date(connection):
    return connection.execute(select(func.max(settlements_table.c.fecha))).scalar_one_or_none()


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
                save_store_to_disk()
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
                saved_clients = save_settlements_report()
                print(f"  [{bucket}] Finalizado - {total} registros totales")
                print(f"  [settlements] Reporte persistido - {saved_clients} clientes")
                await websocket.send_text(
                    json.dumps(
                        {
                            "event": "done_ack",
                            "source": source,
                            "bucket": bucket,
                            "total": total,
                            "settlements_saved": saved_clients,
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


@app.get("/data/client-interactions")
def get_client_interactions():
    data = store["client_interactions"]
    return {"report": "CLIENT INTERACTIONS REPORT", "count": len(data), "records": data}


@app.get("/data/expected-client-payments")
def get_expected_client_payments():
    data = store["expected_client_payments"]
    return {"report": "EXPECTED CLIENT PAYMENTS REPORT", "count": len(data), "records": data}


@app.get("/data/settlement-payment-report")
def get_settlement_payment_report():
    data = store["settlement_payment_report"]
    return {"report": "SETTLEMENT PAYMENT REPORT", "count": len(data), "records": data}


@app.get("/data/new-enrollments")
def get_new_enrollments():
    data = store["new_enrollments"]
    return {"report": "NEW ENROLLMENTS", "count": len(data), "records": data}


@app.get("/data/settlements-per-date")
def get_settlements_per_date():
    data = store["settlements_per_date"]
    return {"report": "SETTLED CLIENTS PER DATE", "count": len(data), "records": data}


@app.get("/data/payments-cleared")
def get_payments_cleared():
    data = store["payments_cleared"]
    return {"report": "PAYMENTS CLEARED REPORT", "count": len(data), "records": data}


@app.get("/data/commissions")
def get_commissions():
    data = store["commissions"]
    return {"report": "COMMISSION REPORT", "count": len(data), "records": data}


@app.get("/data/projected-fees")
def get_projected_fees():
    data = store["projected_fees"]
    return {"report": "PROJECTED FEES REPORT", "count": len(data), "records": data}


@app.get("/data/payment-nsf")
def get_payment_nsf():
    data = store["payment_nsf"]
    return {"report": "PAYMENT NSF REPORT", "count": len(data), "records": data}


@app.get("/data/summary-report")
def get_summary_report():
    data = store["summary_report"]
    return {"report": "SUMMARY REPORT", "count": len(data), "records": data}


@app.get("/data/suspended-payments")
def get_suspended_payments():
    data = store["suspended_payments"]
    return {"report": "SUSPENDED PAYMENT PLANS REPORT", "count": len(data), "records": data}


@app.get("/data/creditor-status")
def get_creditor_status():
    data = store["creditor_status"]
    return {"report": "CREDITOR STATUS REPORT", "count": len(data), "records": data}


@app.get("/data/summary")
def summary():
    return {
        "client_savings_escrow": len(store["client_savings_escrow"]),
        "negotiator_escrow": len(store["negotiator_escrow"]),
        "client_interactions": len(store["client_interactions"]),
        "expected_client_payments": len(store["expected_client_payments"]),
        "settlement_payment_report": len(store["settlement_payment_report"]),
        "new_enrollments": len(store["new_enrollments"]),
        "settlements_per_date": len(store["settlements_per_date"]),
        "payments_cleared": len(store["payments_cleared"]),
        "commissions": len(store["commissions"]),
        "projected_fees": len(store["projected_fees"]),
        "payment_nsf": len(store["payment_nsf"]),
        "summary_report": len(store["summary_report"]),
        "suspended_payments": len(store["suspended_payments"]),
        "creditor_status": len(store["creditor_status"]),
        "debtmanager": len(store["debtmanager"]),
        "last_updated": datetime.utcnow().isoformat(),
    }


@app.get("/settlements")
def get_latest_settlements():
    with engine.begin() as connection:
        fecha = latest_report_date(connection)
        if not fecha:
            return {"fecha": None, "count": 0, "clients": []}
        rows = connection.execute(
            select(settlements_table)
            .where(settlements_table.c.fecha == fecha)
            .order_by(settlements_table.c.client_name)
        ).all()
    return {
        "fecha": fecha,
        "count": len(rows),
        "clients": [settlement_row_to_client(row) for row in rows],
    }


@app.get("/settlements/status")
def get_settlements_status():
    with engine.begin() as connection:
        fecha = latest_report_date(connection)
        if not fecha:
            return {"fecha": None, "count": 0}
        count = connection.execute(
            select(func.count())
            .select_from(settlements_table)
            .where(settlements_table.c.fecha == fecha)
        ).scalar_one()
    return {"fecha": fecha, "count": count}


@app.post("/settlements/refresh")
def refresh_settlements():
    saved_clients = save_settlements_report()
    return {"ok": True, "saved_clients": saved_clients}


@app.delete("/data/clear")
def clear_all():
    for key in store:
        store[key].clear()
    save_store_to_disk()
    return {"message": "Store limpiado"}


@app.delete("/data/clear/{bucket}")
def clear_bucket(bucket: str):
    if bucket not in store:
        return {"error": f"Bucket desconocido: {bucket}", "available": list(store.keys())}
    store[bucket].clear()
    save_store_to_disk()
    return {"message": f"Bucket limpiado: {bucket}"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        ws_ping_interval=600,
        ws_ping_timeout=600,
    )
