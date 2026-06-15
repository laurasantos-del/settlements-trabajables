import asyncio
import json
import os
import subprocess
import sys
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, Integer, MetaData, String, Table, Text, create_engine, delete, func, insert, select

# Make Reportes/ importable (sibling in dev, /Reportes in Docker).
def _reportes_dir() -> Path:
    base = Path(__file__).resolve().parent
    for candidate in (base.parent / "Reportes", base / "Reportes"):
        if (candidate / "ticket_api.py").exists():
            return candidate
    return base.parent / "Reportes"


sys.path.insert(0, str(_reportes_dir()))
import ticket_api  # noqa: E402


_cache: Dict[str, Any] = {}
_cache_loaded = False
_rollbacks: Dict[str, List[Any]] = {}
_pending_scrapes: set = set()

_scraper_state: Dict[str, Any] = {
    "running": False,
    "pid": None,
    "last_run": None,
    "last_error": None,
    "started_at": None,
}

DATA_FILE = Path("debtmanager_store.json")
DB_FILE = Path("settlements.db")
META_FILE = Path("scraper_meta.json")
FONDOS_MINIMO = 40

SCRAPER_INTERVAL_HOURS = float(os.getenv("SCRAPER_INTERVAL_HOURS", "6"))
SCRAPER_AUTO_RUN = os.getenv("SCRAPER_AUTO_RUN", "true").lower() == "true"
SCRAPER_STALE_HOURS = float(os.getenv("SCRAPER_STALE_HOURS", "6"))

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

REPORT_BUCKETS = [key for key in store if key != "debtmanager"]
REPORT_MIN_COUNTS: Dict[str, int] = {
    "client_interactions": 500,
    "new_enrollments": 10,
    "expected_client_payments": 100,
    "settlement_payment_report": 100,
    "payments_cleared": 50,
    "payment_nsf": 100,
    "creditor_status": 50,
    "negotiator_escrow": 50,
}
SKIP_AUTO_SCRAPE = {"commissions", "debtmanager"}
OPTIONAL_EMPTY_REPORTS = {"projected_fees", "suspended_payments"}

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


# ── Persistence helpers ──────────────────────────────────────────────────────

def read_store_file() -> dict:
    if not DATA_FILE.exists():
        return {}
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_store_to_disk() -> None:
    DATA_FILE.write_text(json.dumps(store, ensure_ascii=False), encoding="utf-8")


def load_meta() -> dict:
    if not META_FILE.exists():
        return {}
    try:
        return json.loads(META_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_meta(data: dict) -> None:
    META_FILE.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def bootstrap_meta_from_store() -> None:
    """If scraper_meta.json is missing but the data file exists, seed last_scrape_success
    from the data file's mtime so the auto-scraper doesn't trigger on every restart."""
    if META_FILE.exists() or not DATA_FILE.exists():
        return
    try:
        mtime = datetime.fromtimestamp(DATA_FILE.stat().st_mtime, tz=timezone.utc).replace(tzinfo=None).isoformat()
        save_meta({"last_scrape_success": mtime})
        print(f"[Meta] Inicializado desde mtime de {DATA_FILE.name}: {mtime}", flush=True)
    except Exception as exc:
        print(f"[Meta] No se pudo inicializar: {exc}", flush=True)


def is_data_stale() -> bool:
    meta = load_meta()
    last = meta.get("last_scrape_success")
    if not last:
        return True
    try:
        elapsed = (datetime.utcnow() - datetime.fromisoformat(last)).total_seconds()
        return elapsed > SCRAPER_STALE_HOURS * 3600
    except Exception:
        return True


def missing_reports() -> List[str]:
    missing: List[str] = []
    negotiator_count = len(cached_records("negotiator_escrow"))
    meta = load_meta()
    scraped_recently = bool(meta.get("last_scrape_success"))
    for bucket in REPORT_BUCKETS:
        if bucket in SKIP_AUTO_SCRAPE:
            continue
        if bucket == "client_savings_escrow" and negotiator_count >= REPORT_MIN_COUNTS.get("negotiator_escrow", 1):
            continue
        count = len(cached_records(bucket))
        if bucket in OPTIONAL_EMPTY_REPORTS and count == 0 and scraped_recently:
            continue
        minimum = REPORT_MIN_COUNTS.get(bucket, 1)
        if count < minimum:
            missing.append(bucket)
    return missing


# ── Scraper management ───────────────────────────────────────────────────────

async def run_scraper(reports_only: Optional[str] = None) -> dict:
    if _scraper_state["running"]:
        return {"ok": False, "message": "El scraper ya está corriendo", "pid": _scraper_state["pid"]}

    _scraper_state["running"] = True
    _scraper_state["last_error"] = None
    _scraper_state["started_at"] = datetime.utcnow().isoformat()

    venv_python = Path(".venv/bin/python")
    python_bin = str(venv_python) if venv_python.exists() else sys.executable
    cwd = str(Path(__file__).parent)

    env = {**os.environ, "WS_URL": os.getenv("WS_URL", "ws://localhost:8000/ws/data")}
    if reports_only:
        env["REPORTS_ONLY"] = reports_only

    try:
        proc = await asyncio.create_subprocess_exec(
            python_bin, "debtmanager_scraper.py",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=cwd,
            env=env,
        )
        _scraper_state["pid"] = proc.pid
        print(f"[Scraper] Iniciado — PID {proc.pid}", flush=True)

        stdout, _ = await proc.communicate()
        output = stdout.decode(errors="replace") if stdout else ""

        if proc.returncode == 0:
            ts = datetime.utcnow().isoformat()
            _scraper_state["last_run"] = ts
            meta = load_meta()
            meta["last_scrape_success"] = ts
            save_meta(meta)
            print(f"[Scraper] Completado exitosamente ({ts})", flush=True)
        else:
            _scraper_state["last_error"] = output[-1000:]
            print(f"[Scraper] Terminó con error — código {proc.returncode}", flush=True)
            print(output[-500:], flush=True)

    except Exception as exc:
        _scraper_state["last_error"] = str(exc)
        print(f"[Scraper] Excepción: {exc}", flush=True)
    finally:
        _scraper_state["running"] = False
        _scraper_state["pid"] = None

    return {"ok": _scraper_state["last_error"] is None}


async def periodic_scraper_loop() -> None:
    interval = SCRAPER_INTERVAL_HOURS * 3600
    print(f"[Scraper] Recarga periódica cada {SCRAPER_INTERVAL_HOURS}h", flush=True)
    while True:
        await asyncio.sleep(interval)
        print(f"[Scraper] Ejecución periódica programada", flush=True)
        await run_scraper()


# ── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cache, _cache_loaded

    # Load persisted data
    try:
        saved = read_store_file()
        for key in store:
            if isinstance(saved.get(key), list):
                store[key] = saved[key]
        _cache = {key: store.get(key, []) for key in store}
        for key, value in saved.items():
            if key not in _cache:
                _cache[key] = value
        _cache_loaded = True
        total = sum(len(v) for v in _cache.values() if isinstance(v, list))
        print(f"[Cache] {total} registros cargados desde disco", flush=True)
    except Exception as exc:
        print(f"[Cache] Error al cargar: {exc}", flush=True)

    # Seed meta from data file mtime if scraper_meta.json is missing
    bootstrap_meta_from_store()

    # Auto-run scraper if stale or empty
    total_records = sum(len(v) for v in _cache.values() if isinstance(v, list))
    missing = missing_reports()
    if SCRAPER_AUTO_RUN and (total_records == 0 or is_data_stale()):
        reason = "sin datos" if total_records == 0 else f"datos obsoletos (>{SCRAPER_STALE_HOURS}h)"
        print(f"[Scraper] Auto-inicio — {reason}", flush=True)
        asyncio.create_task(run_scraper())
    elif SCRAPER_AUTO_RUN and missing:
        print(f"[Scraper] Auto-inicio parcial — reportes faltantes: {', '.join(missing)}", flush=True)
        asyncio.create_task(run_scraper(",".join(missing)))

    # Start periodic refresh background task
    periodic_task = asyncio.create_task(periodic_scraper_loop())

    yield

    periodic_task.cancel()
    try:
        await periodic_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="DebtFreedom Data Receiver", lifespan=lifespan)
_EXTRA_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3003",
        "http://localhost:4000",
        "http://127.0.0.1:4000",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "https://8786zrwt-3000.use2.devtunnels.ms",
        *_EXTRA_ORIGINS,
    ],
    allow_origin_regex=(
        r"https://(.*\.devtunnels\.ms"
        r"|.*\.vercel\.app"
        r"|.*\.railway\.app)"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


connected_clients: List[WebSocket] = []


# ── Utility functions ────────────────────────────────────────────────────────

def clean_text(value) -> str:
    return str(value or "").strip()


def is_valid_client_id(client_id: str) -> bool:
    """Client IDs in DebtManager are 5-9 digit numbers."""
    s = client_id.strip()
    return s.isdigit() and 4 <= len(s) <= 10


def money_to_number(value) -> float:
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


def build_savings_index() -> dict:
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


def build_settlement_clients() -> list:
    savings_index = build_savings_index()
    clients = {}

    for row in store["negotiator_escrow"]:
        status = clean_text(row_value(row, "Client Status"))
        if status and status.lower() != "active":
            continue

        client_id = clean_text(row_value(row, "Client ID"))
        client_name = clean_text(row_value(row, "Client Name"))
        sid = clean_text(row_value(row, "Sid"))

        # Skip navigation/garbage rows scraped from DebtManager HTML
        if client_id and not is_valid_client_id(client_id):
            continue

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
        if client_id and not is_valid_client_id(client_id):
            continue
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


def save_settlements_report(report_date=None) -> int:
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


def settlement_row_to_client(row) -> dict:
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


def cached_records(bucket: str) -> list:
    records = _cache.get(bucket, [])
    return records if isinstance(records, list) else []


def data_response(bucket: str, report: str, response: Response) -> dict:
    records = cached_records(bucket)
    response.headers["X-Cache"] = "HIT"
    return {"report": report, "count": len(records), "records": records}


# ── WebSocket ────────────────────────────────────────────────────────────────

@app.websocket("/ws/data")
async def websocket_data(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    print(f"[WS] Cliente conectado — {websocket.client}", flush=True)
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

            if event == "start":
                report_name = data.get("report", source) if isinstance(data, dict) else source
                bucket = report_name if report_name in store else ("debtmanager" if source not in store else source)
                _rollbacks[bucket] = list(store.get(bucket, []))
                _pending_scrapes.add(bucket)
                store[bucket] = []
                _cache[bucket] = store[bucket]
                # NOTE: do NOT save to disk on every start — too expensive at 69 MB
                print(f"  [{bucket}] Reiniciado para nueva extracción", flush=True)
                await websocket.send_text(
                    json.dumps({
                        "event": "start_ack",
                        "source": source,
                        "bucket": bucket,
                        "count": 0,
                    })
                )
                continue

            if event == "batch":
                records = data if isinstance(data, list) else [data]
                sub_report = records[0].get("_report", "") if records else ""
                bucket = sub_report if sub_report in store else ("debtmanager" if source not in store else source)
                store[bucket].extend(records)
                _cache[bucket] = store[bucket]
                # NOTE: do NOT save to disk on every batch — too expensive at 69 MB.
                # Disk write happens once in the 'done' event.
                count = len(store[bucket])
                print(f"  [{bucket}] +{len(records)} registros → total: {count}", flush=True)
                await websocket.send_text(
                    json.dumps({
                        "event": "ack",
                        "source": source,
                        "bucket": bucket,
                        "count": count,
                    })
                )

            elif event == "done":
                report_name = data.get("report", source)
                bucket = report_name if report_name in store else "debtmanager"
                total = len(store.get(bucket, []))
                if total == 0 and bucket in _rollbacks:
                    store[bucket] = _rollbacks.pop(bucket)
                    _cache[bucket] = store[bucket]
                    total = len(store[bucket])
                    print(f"  [{bucket}] Sin datos nuevos — restaurado respaldo ({total} registros)", flush=True)
                else:
                    _rollbacks.pop(bucket, None)
                _pending_scrapes.discard(bucket)
                _cache[bucket] = store.get(bucket, [])

                # Persist JSON to disk once per report (not per batch)
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, save_store_to_disk)

                saved_clients = save_settlements_report()
                print(f"  [{bucket}] Finalizado — {total} registros", flush=True)
                print(f"  [settlements] {saved_clients} clientes persistidos", flush=True)
                await websocket.send_text(
                    json.dumps({
                        "event": "done_ack",
                        "source": source,
                        "bucket": bucket,
                        "total": total,
                        "settlements_saved": saved_clients,
                    })
                )

    except WebSocketDisconnect:
        for bucket in list(_pending_scrapes):
            backup = _rollbacks.get(bucket)
            if backup is not None:
                store[bucket] = backup
                _cache[bucket] = backup
                print(f"  [{bucket}] Scrape interrumpido — restaurado respaldo ({len(backup)} registros)", flush=True)
        _pending_scrapes.clear()
        _rollbacks.clear()
        if websocket in connected_clients:
            connected_clients.remove(websocket)
        print("[WS] Cliente desconectado", flush=True)


# ── Data endpoints ───────────────────────────────────────────────────────────

@app.get("/data/client-savings-escrow")
def get_client_savings(response: Response):
    return data_response("client_savings_escrow", "CLIENT SAVINGS/ESCROW REPORT", response)


@app.get("/data/negotiator-escrow")
def get_negotiator_escrow(response: Response):
    return data_response("negotiator_escrow", "NEGOTIATOR/ESCROW REPORT", response)


@app.get("/data/client-interactions")
def get_client_interactions(response: Response):
    return data_response("client_interactions", "CLIENT INTERACTIONS REPORT", response)


@app.get("/data/expected-client-payments")
def get_expected_client_payments(response: Response):
    return data_response("expected_client_payments", "EXPECTED CLIENT PAYMENTS REPORT", response)


# ---------------------------------------------------------------------------
# Ticket review & send  (NSF and CS/BO) + tomorrow's payments
# ---------------------------------------------------------------------------
from pydantic import BaseModel  # noqa: E402


class CreateTicketsBody(BaseModel):
    tickets: list[dict]


@app.get("/tickets/{kind}/preview")
def tickets_preview(kind: str):
    if kind == "nsf":
        return {"tickets": ticket_api.preview_nsf()}
    if kind == "csbo":
        return {"tickets": ticket_api.preview_csbo()}
    return {"tickets": [], "error": f"unknown kind '{kind}'"}


@app.post("/tickets/{kind}/create")
def tickets_create(kind: str, body: CreateTicketsBody):
    if kind not in ("nsf", "csbo"):
        return {"results": [], "error": f"unknown kind '{kind}'"}
    results = ticket_api.create_tickets(kind, body.tickets)
    return {"results": results}


@app.get("/tickets/{kind}/created-today")
def tickets_created_today(kind: str):
    conn = ticket_api.connect()
    try:
        return {"tickets": ticket_api.created_today(conn, kind)}
    finally:
        conn.close()


@app.post("/tickets/nsf/refresh")
async def tickets_nsf_refresh():
    """Re-scrape the NSF report into dm_nsf_last_scrape.json WITHOUT creating
    tickets (dm_nsf_agent --dry-run scrapes and writes its output only)."""
    reportes_dir = str(_reportes_dir())
    asyncio.create_task(asyncio.create_subprocess_exec(
        sys.executable, "dm_nsf_agent.py", "--dry-run", cwd=reportes_dir,
    ))
    return {"ok": True, "message": "NSF refresh started"}


@app.get("/payments/tomorrow")
def payments_tomorrow():
    return ticket_api.tomorrow_payments()


@app.get("/data/settlement-payment-report")
def get_settlement_payment_report(response: Response):
    return data_response("settlement_payment_report", "SETTLEMENT PAYMENT REPORT", response)


@app.get("/data/new-enrollments")
def get_new_enrollments(response: Response):
    return data_response("new_enrollments", "NEW ENROLLMENTS", response)


@app.get("/data/settlements-per-date")
def get_settlements_per_date(response: Response):
    return data_response("settlements_per_date", "SETTLED CLIENTS PER DATE", response)


@app.get("/data/payments-cleared")
def get_payments_cleared(response: Response):
    return data_response("payments_cleared", "PAYMENTS CLEARED REPORT", response)


@app.get("/data/commissions")
def get_commissions(response: Response):
    return data_response("commissions", "COMMISSION REPORT", response)


@app.get("/data/projected-fees")
def get_projected_fees(response: Response):
    return data_response("projected_fees", "PROJECTED FEES REPORT", response)


@app.get("/data/payment-nsf")
def get_payment_nsf(response: Response):
    return data_response("payment_nsf", "PAYMENT NSF REPORT", response)


@app.get("/data/summary-report")
def get_summary_report(response: Response):
    return data_response("summary_report", "SUMMARY REPORT", response)


@app.get("/data/suspended-payments")
def get_suspended_payments(response: Response):
    return data_response("suspended_payments", "SUSPENDED PAYMENT PLANS REPORT", response)


@app.get("/data/creditor-status")
def get_creditor_status(response: Response):
    return data_response("creditor_status", "CREDITOR STATUS REPORT", response)


@app.get("/data/summary")
def summary(response: Response):
    response.headers["X-Cache"] = "HIT"
    meta = load_meta()
    missing = missing_reports()
    return {
        "client_savings_escrow": len(cached_records("client_savings_escrow")),
        "negotiator_escrow": len(cached_records("negotiator_escrow")),
        "client_interactions": len(cached_records("client_interactions")),
        "expected_client_payments": len(cached_records("expected_client_payments")),
        "settlement_payment_report": len(cached_records("settlement_payment_report")),
        "new_enrollments": len(cached_records("new_enrollments")),
        "settlements_per_date": len(cached_records("settlements_per_date")),
        "payments_cleared": len(cached_records("payments_cleared")),
        "commissions": len(cached_records("commissions")),
        "projected_fees": len(cached_records("projected_fees")),
        "payment_nsf": len(cached_records("payment_nsf")),
        "summary_report": len(cached_records("summary_report")),
        "suspended_payments": len(cached_records("suspended_payments")),
        "creditor_status": len(cached_records("creditor_status")),
        "debtmanager": len(cached_records("debtmanager")),
        "cache_loaded": _cache_loaded,
        "last_scrape": meta.get("last_scrape_success"),
        "missing_reports": missing,
        "last_updated": datetime.utcnow().isoformat(),
    }


# ── Cache endpoints ──────────────────────────────────────────────────────────

@app.post("/cache/refresh")
async def refresh_cache():
    global _cache, _cache_loaded
    saved = read_store_file()
    for key in store:
        if isinstance(saved.get(key), list):
            store[key] = saved[key]
    _cache = {key: store.get(key, []) for key in store}
    for key, value in saved.items():
        if key not in _cache:
            _cache[key] = value
    _cache_loaded = True
    counts = {key: len(value) for key, value in _cache.items() if isinstance(value, list)}
    return {"ok": True, "counts": counts}


@app.delete("/data/clear")
def clear_all():
    for key in store:
        store[key].clear()
        _cache[key] = store[key]
    save_store_to_disk()
    return {"message": "Store limpiado"}


@app.delete("/data/clear/{bucket}")
def clear_bucket(bucket: str):
    if bucket not in store:
        return {"error": f"Bucket desconocido: {bucket}", "available": list(store.keys())}
    store[bucket].clear()
    _cache[bucket] = store[bucket]
    save_store_to_disk()
    return {"message": f"Bucket limpiado: {bucket}"}


# ── Scraper endpoints ────────────────────────────────────────────────────────

@app.post("/scraper/run")
async def trigger_scraper(reports_only: str = ""):
    if _scraper_state["running"]:
        return {
            "ok": False,
            "message": "El scraper ya está corriendo",
            "pid": _scraper_state["pid"],
            "started_at": _scraper_state["started_at"],
        }
    asyncio.create_task(run_scraper(reports_only or None))
    return {"ok": True, "message": "Scraper iniciado en background"}


@app.post("/scraper/run-missing")
async def trigger_missing_scraper():
    if _scraper_state["running"]:
        return {
            "ok": False,
            "message": "El scraper ya está corriendo",
            "pid": _scraper_state["pid"],
            "started_at": _scraper_state["started_at"],
        }
    missing = missing_reports()
    if not missing:
        return {"ok": True, "message": "Todos los reportes tienen datos", "missing_reports": []}
    reports_only = ",".join(missing)
    asyncio.create_task(run_scraper(reports_only))
    return {"ok": True, "message": "Scraper iniciado para reportes faltantes", "missing_reports": missing}


@app.get("/scraper/status")
def scraper_status():
    meta = load_meta()
    return {
        "running": _scraper_state["running"],
        "pid": _scraper_state["pid"],
        "started_at": _scraper_state["started_at"],
        "last_run": _scraper_state["last_run"],
        "last_error": _scraper_state["last_error"],
        "last_scrape_success": meta.get("last_scrape_success"),
        "interval_hours": SCRAPER_INTERVAL_HOURS,
        "auto_run": SCRAPER_AUTO_RUN,
        "stale_after_hours": SCRAPER_STALE_HOURS,
    }


# ── Settlement endpoints ─────────────────────────────────────────────────────

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


# ── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        ws_ping_interval=600,
        ws_ping_timeout=600,
    )
