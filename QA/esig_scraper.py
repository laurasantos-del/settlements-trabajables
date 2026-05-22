#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
esig_scraper.py - Auto-Scraper: Electronic Signature Library
DebtTrakker / Leadsconnection

USO:
  python3 esig_scraper.py                    -> Modo continuo cada 1 hora
  python3 esig_scraper.py --once             -> Una verificacion completa
  python3 esig_scraper.py --once --max-pages 2 --skip-hubspot
"""

import argparse
import csv
import json
import os
import re
import time
from datetime import datetime

import requests
from bs4 import BeautifulSoup
from cryptography.fernet import Fernet

URL = "https://secure.debttrakker.net/Manager.aspx"
PARAMS = {"mid": "6", "sid": "50"}

DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(DIR, "esig_library_data.csv")
CHANGES_FILE = os.path.join(DIR, "esig_changes_log.json")
LOG_FILE = os.path.join(DIR, "esig_scraper.log")
HUBSPOT_TICKETS_FILE = os.path.join(DIR, "hubspot_tickets_created.json")
SECRETS_FILE = os.path.join(DIR, ".secrets.enc")
SECRET_KEY_FILE = os.path.join(DIR, ".secret.key")

INTERVAL = 3600
DEFAULT_MAX_PAGES = None
SIGNED_THRESHOLD = 0.90
SIGNED_STATUS_KEYWORDS = ("signed", "firmado", "completed", "complete", "executed")
HUBSPOT_API_URL = "https://api.hubapi.com/crm/v3/objects/tickets"

FIELDS = [
    "id",
    "lead_id",
    "date",
    "vendor",
    "user",
    "first_name",
    "last_name",
    "status",
    "scraped_at",
]


def load_env_file(path):
    if not os.path.exists(path):
        return

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def load_encrypted_secrets(secrets_path=SECRETS_FILE, key_path=SECRET_KEY_FILE):
    if not os.path.exists(secrets_path) or not os.path.exists(key_path):
        return

    with open(key_path, "rb") as f:
        key = f.read().strip()
    with open(secrets_path, "rb") as f:
        encrypted_payload = f.read()

    payload = json.loads(Fernet(key).decrypt(encrypted_payload).decode("utf-8"))
    for key, value in payload.items():
        if key and key not in os.environ:
            os.environ[key] = str(value)


load_env_file(os.path.join(DIR, ".env"))
load_encrypted_secrets()

HUBSPOT_ACCESS_TOKEN = os.getenv("HUBSPOT_ACCESS_TOKEN", "").strip()
HUBSPOT_PIPELINE = os.getenv("HUBSPOT_PIPELINE", "").strip()
HUBSPOT_PIPELINE_STAGE = os.getenv("HUBSPOT_PIPELINE_STAGE", "").strip()
HUBSPOT_TICKET_PRIORITY = os.getenv("HUBSPOT_TICKET_PRIORITY", "HIGH").strip()
HUBSPOT_OWNER_ID = os.getenv("HUBSPOT_OWNER_ID", "").strip()

COOKIES = {
    "LCCurrentSessionID": os.getenv("ESIG_COOKIE_LCCURRENTSESSIONID", "").strip(),
    "LCUID": os.getenv("ESIG_COOKIE_LCUID", "").strip(),
    "Leads_Manager": os.getenv("ESIG_COOKIE_LEADS_MANAGER", "").strip(),
    "Leads_Office": os.getenv("ESIG_COOKIE_LEADS_OFFICE", "Debt Freedom LLC").strip(),
    "Leads_OfficeID": os.getenv("ESIG_COOKIE_LEADS_OFFICEID", "361").strip(),
    "Leads_Department": os.getenv("ESIG_COOKIE_LEADS_DEPARTMENT", "SALES").strip(),
    "Leads_EmployeeType": os.getenv("ESIG_COOKIE_LEADS_EMPLOYEETYPE", "STANDARD USER").strip(),
    "IsLoggedOut": os.getenv("ESIG_COOKIE_ISLOGGEDOUT", "0").strip(),
}


def log(msg, level="INFO"):
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


REQUIRED_COOKIES = ("LCCurrentSessionID", "LCUID", "Leads_Manager")


class SessionExpiredError(Exception):
    """La sesion de DebtTrakker ya no es valida (redirige a login)."""


def check_required_cookies():
    """Devuelve lista de cookies requeridas que faltan."""
    return [name for name in REQUIRED_COOKIES if not COOKIES.get(name, "").strip()]


def make_session():
    session = requests.Session()
    # Solo enviamos cookies con valor
    session.cookies.update({k: v for k, v in COOKIES.items() if v})
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-US,es;q=0.9,en;q=0.8",
            "Referer": URL,
        }
    )
    return session


def looks_like_login(url, html):
    """Detecta si la respuesta es la pagina de login."""
    if "Login.aspx" in (url or ""):
        return True
    if not html:
        return False
    lowered = html.lower()
    indicators = [
        "login.aspx",
        'name="txtusername"',
        'name="txtpassword"',
        "forgot your password",
        "olvidaste tu contrase",
    ]
    return any(ind in lowered for ind in indicators)


def explain_session_expired():
    log("=" * 60, "ERROR")
    log("SESION DE DEBTTRAKKER EXPIRADA O COOKIES INVALIDAS", "ERROR")
    log("=" * 60, "ERROR")
    log("El servidor nos redirigio a Login.aspx.", "ERROR")
    log("Esto pasa cuando:", "ERROR")
    log("  - Las cookies caducaron por inactividad.", "ERROR")
    log("  - El usuario cerro sesion en el navegador.", "ERROR")
    log("  - El usuario inicio sesion en otra parte y la sesion vieja se invalido.", "ERROR")
    log("", "ERROR")
    log("PARA ARREGLARLO:", "ERROR")
    log("  1. Abre Chrome, inicia sesion en https://secure.debttrakker.net", "ERROR")
    log("  2. Abre DevTools (F12) -> Application -> Cookies", "ERROR")
    log("  3. Copia los valores NUEVOS de:", "ERROR")
    log("       LCCurrentSessionID", "ERROR")
    log("       LCUID", "ERROR")
    log("       Leads_Manager", "ERROR")
    log("  4. Actualizalas con:", "ERROR")
    log("       python3 manage_secrets.py --set-cookies", "ERROR")
    log("  5. Verifica con:", "ERROR")
    log("       python3 manage_secrets.py --status", "ERROR")
    log("  6. Reintenta:", "ERROR")
    log("       python3 esig_scraper.py --once --max-pages 1 --skip-hubspot", "ERROR")
    log("=" * 60, "ERROR")


def get_hidden_fields(html):
    soup = BeautifulSoup(html, "html.parser")
    return {
        input_tag["name"]: input_tag.get("value", "")
        for input_tag in soup.find_all("input", type="hidden")
        if input_tag.get("name")
    }


def fetch_page(session, page_num=1, html1=None):
    if page_num == 1:
        response = session.get(URL, params=PARAMS, timeout=30, allow_redirects=True)
        response.raise_for_status()
        if looks_like_login(response.url, response.text):
            # Guarda HTML para inspeccion manual
            try:
                with open(os.path.join(DIR, "debug_debttrakker_response.html"), "w", encoding="utf-8") as f:
                    f.write(response.text)
            except Exception:
                pass
            raise SessionExpiredError(f"redirigido a login: {response.url}")
        return response.text

    if html1 is None:
        html1 = session.get(URL, params=PARAMS, timeout=30).text
        if looks_like_login(URL, html1):
            raise SessionExpiredError("redirigido a login al obtener pagina inicial")

    fields = get_hidden_fields(html1)
    fields.update(
        {
            "__EVENTTARGET": f"ctl05$EsigGrid$ctl00$ctl03$ctl01$ctl{(page_num - 1) * 2:02d}",
            "__EVENTARGUMENT": "",
            "ctl05$ddlOffices": "Debt Freedom LLC",
        }
    )
    response = session.post(URL, params=PARAMS, data=fields, timeout=30)
    response.raise_for_status()
    if looks_like_login(response.url, response.text):
        raise SessionExpiredError(f"redirigido a login en pagina {page_num}")
    return response.text


def parse_table(html):
    soup = BeautifulSoup(html, "html.parser")
    rows = []

    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True) for th in table.find_all("th")]
        if "ID" not in headers or "LeadID" not in headers:
            continue

        for tr in table.find_all("tr"):
            cells = tr.find_all("td")
            if len(cells) >= 8 and cells[0].get_text(strip=True).isdigit():
                rows.append(
                    {
                        "id": cells[0].get_text(strip=True),
                        "lead_id": cells[1].get_text(strip=True),
                        "date": cells[2].get_text(strip=True),
                        "vendor": cells[3].get_text(strip=True),
                        "user": cells[4].get_text(strip=True),
                        "first_name": cells[5].get_text(strip=True),
                        "last_name": cells[6].get_text(strip=True),
                        "status": cells[7].get_text(strip=True),
                        "scraped_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    }
                )
        break

    pages_match = re.search(r"(\d+)\s*pages", html, re.I)
    records_match = re.search(r"(\d+)\s*items", html, re.I)
    total_pages = int(pages_match.group(1)) if pages_match else 1
    total_records = int(records_match.group(1)) if records_match else len(rows)
    return rows, total_pages, total_records


def scrape_all(session, max_pages=None):
    log("Iniciando scraping...")
    html1 = fetch_page(session, 1)
    rows, total_pages, total_records = parse_table(html1)

    if not rows:
        # Si no son filas pero tampoco era login, igualmente revisa por las dudas
        if looks_like_login(URL, html1):
            raise SessionExpiredError("la pagina inicial parece ser login")
        # Guarda HTML para debug
        try:
            with open(os.path.join(DIR, "debug_debttrakker_response.html"), "w", encoding="utf-8") as f:
                f.write(html1)
        except Exception:
            pass
        log("Sin datos parseables. Se guardo debug_debttrakker_response.html para inspeccion.", "ERROR")
        log("Posibles causas: cookies invalidas, cambio del layout HTML, o filtros activos.", "ERROR")
        return []

    pages = min(total_pages, max_pages) if max_pages else total_pages
    log(f"Total: {total_records} registros en {total_pages} paginas (scrapeando {pages})")

    all_rows = list(rows)
    for page in range(2, pages + 1):
        log(f"  Pagina {page}/{pages}...")
        time.sleep(0.8)
        try:
            page_rows, _, _ = parse_table(fetch_page(session, page, html1))
            all_rows.extend(page_rows)
        except Exception as exc:
            log(f"  Error pagina {page}: {exc}", "WARN")

    log(f"Scraping completo: {len(all_rows)} registros")
    return all_rows


def load_csv():
    if not os.path.exists(CSV_FILE):
        return []
    with open(CSV_FILE, "r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def save_csv(records):
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)
    log(f"CSV guardado: {CSV_FILE} ({len(records)} registros)")


def load_json_file(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json_file(path, payload):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def detect_changes(old, new):
    old_by_id = {record["id"]: record for record in old}
    new_by_id = {record["id"]: record for record in new}
    added = [record for record_id, record in new_by_id.items() if record_id not in old_by_id]
    removed = [record for record_id, record in old_by_id.items() if record_id not in new_by_id]
    modified = []

    for record_id, new_record in new_by_id.items():
        if record_id not in old_by_id:
            continue

        diffs = {
            key: {
                "before": old_by_id[record_id].get(key),
                "after": new_record.get(key),
            }
            for key in ["status", "vendor", "user", "date"]
            if old_by_id[record_id].get(key) != new_record.get(key)
        }
        if diffs:
            modified.append({"id": record_id, "changes": diffs, "record": new_record})

    return {"added": added, "removed": removed, "modified": modified}


def report_changes(changes):
    total = len(changes["added"]) + len(changes["removed"]) + len(changes["modified"])
    if total == 0:
        log("Sin cambios detectados.")
        return False

    log(
        "*** CAMBIOS: "
        f"+{len(changes['added'])} nuevos "
        f"-{len(changes['removed'])} eliminados "
        f"~{len(changes['modified'])} modificados ***"
    )
    for record in changes["added"][:10]:
        log(f"  + [{record['id']}] {record['first_name']} {record['last_name']} | {record['status']}")
    for record in changes["removed"][:5]:
        log(f"  - [{record['id']}] {record['first_name']} {record['last_name']}")
    for modified_record in changes["modified"][:10]:
        log(f"  ~ [{modified_record['id']}] {modified_record['changes']}")

    history = load_json_file(CHANGES_FILE, [])
    history.append(
        {
            "timestamp": datetime.now().isoformat(),
            "summary": {
                "added": len(changes["added"]),
                "removed": len(changes["removed"]),
                "modified": len(changes["modified"]),
            },
            "details": changes,
        }
    )
    save_json_file(CHANGES_FILE, history)
    log(f"Cambios guardados: {CHANGES_FILE}")
    return True


def is_signed_status(status):
    normalized = (status or "").strip().lower()
    return any(keyword in normalized for keyword in SIGNED_STATUS_KEYWORDS)


def summarize_clients(records):
    clients = {}
    for record in records:
        lead_id = record.get("lead_id", "").strip()
        if not lead_id:
            continue

        client = clients.setdefault(
            lead_id,
            {
                "lead_id": lead_id,
                "first_name": record.get("first_name", "").strip(),
                "last_name": record.get("last_name", "").strip(),
                "total_docs": 0,
                "signed_docs": 0,
                "statuses": {},
            },
        )

        status = record.get("status", "").strip() or "(sin status)"
        client["total_docs"] += 1
        client["signed_docs"] += 1 if is_signed_status(status) else 0
        client["statuses"][status] = client["statuses"].get(status, 0) + 1

        if not client["first_name"] and record.get("first_name"):
            client["first_name"] = record["first_name"].strip()
        if not client["last_name"] and record.get("last_name"):
            client["last_name"] = record["last_name"].strip()

    for client in clients.values():
        client["signed_percent"] = (
            round(client["signed_docs"] / client["total_docs"], 4)
            if client["total_docs"]
            else 0
        )
    return clients


def hubspot_configured():
    return bool(HUBSPOT_ACCESS_TOKEN and HUBSPOT_PIPELINE and HUBSPOT_PIPELINE_STAGE)


def build_ticket_payload(client):
    percent = client["signed_percent"] * 100
    client_name = f"{client['first_name']} {client['last_name']}".strip() or f"Lead {client['lead_id']}"
    status_lines = ", ".join(
        f"{status}: {count}" for status, count in sorted(client["statuses"].items())
    )
    content = (
        f"Cliente alcanzo {percent:.1f}% firmado en Electronic Signature Library.\n"
        f"LeadID: {client['lead_id']}\n"
        f"Documentos firmados: {client['signed_docs']} de {client['total_docs']}\n"
        f"Distribucion de status: {status_lines}\n"
        f"Detectado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )

    properties = {
        "subject": f"ESIG 90% firmado - {client_name} - LeadID {client['lead_id']}",
        "hs_pipeline_stage": HUBSPOT_PIPELINE_STAGE,
        "hs_ticket_priority": HUBSPOT_TICKET_PRIORITY,
        "content": content,
    }
    if HUBSPOT_PIPELINE:
        properties["hs_pipeline"] = HUBSPOT_PIPELINE
    if HUBSPOT_OWNER_ID:
        properties["hubspot_owner_id"] = HUBSPOT_OWNER_ID

    return {"properties": properties}


def create_hubspot_ticket(client):
    response = requests.post(
        HUBSPOT_API_URL,
        headers={
            "Authorization": f"Bearer {HUBSPOT_ACCESS_TOKEN}",
            "Content-Type": "application/json",
        },
        json=build_ticket_payload(client),
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def process_hubspot_threshold_tickets(records, skip_hubspot=False):
    if skip_hubspot:
        log("HubSpot omitido por --skip-hubspot.")
        return

    if not hubspot_configured():
        log(
            "HubSpot no configurado. Define HUBSPOT_ACCESS_TOKEN, HUBSPOT_PIPELINE y HUBSPOT_PIPELINE_STAGE.",
            "WARN",
        )
        return

    created = load_json_file(HUBSPOT_TICKETS_FILE, {})
    clients = summarize_clients(records)
    eligible_clients = [
        client
        for client in clients.values()
        if client["total_docs"] > 0 and client["signed_percent"] >= SIGNED_THRESHOLD
    ]

    log(f"Clientes >= {SIGNED_THRESHOLD:.0%} firmado: {len(eligible_clients)}")

    for client in eligible_clients:
        lead_id = client["lead_id"]
        if lead_id in created:
            continue

        try:
            ticket = create_hubspot_ticket(client)
            created[lead_id] = {
                "ticket_id": ticket.get("id"),
                "created_at": datetime.now().isoformat(),
                "signed_percent": client["signed_percent"],
                "signed_docs": client["signed_docs"],
                "total_docs": client["total_docs"],
            }
            save_json_file(HUBSPOT_TICKETS_FILE, created)
            log(f"Ticket HubSpot creado para LeadID {lead_id}: {ticket.get('id')}")
        except Exception as exc:
            log(f"No se pudo crear ticket HubSpot para LeadID {lead_id}: {exc}", "ERROR")


def run_once(max_pages=None, skip_hubspot=False):
    log("=" * 55)
    log("Verificando Electronic Signature Library...")
    faltan = check_required_cookies()
    if faltan:
        log(f"Faltan cookies requeridas: {', '.join(faltan)}", "ERROR")
        log("Configuralas con:  python3 manage_secrets.py --set-cookies", "ERROR")
        return False
    try:
        session = make_session()
        new_rows = scrape_all(session, max_pages=max_pages)
        if not new_rows:
            return False

        old_rows = load_csv()
        if old_rows:
            report_changes(detect_changes(old_rows, new_rows))
        else:
            log(f"Primera ejecucion: {len(new_rows)} registros.")

        save_csv(new_rows)
        process_hubspot_threshold_tickets(new_rows, skip_hubspot=skip_hubspot)
        return True
    except SessionExpiredError as exc:
        log(f"Sesion expirada: {exc}", "ERROR")
        explain_session_expired()
        return False
    except Exception as exc:
        import traceback

        log(f"Error: {exc}\n{traceback.format_exc()}", "ERROR")
        return False


def run_continuous(max_pages=None, skip_hubspot=False):
    log("Auto-Scraper ESIG Library iniciado")
    log(f"Intervalo: {INTERVAL}s | Datos: {CSV_FILE}")
    log("Ctrl+C para detener.\n")

    while True:
        try:
            run_once(max_pages=max_pages, skip_hubspot=skip_hubspot)
            log(f"Proxima verificacion en {INTERVAL}s...\n")
            time.sleep(INTERVAL)
        except KeyboardInterrupt:
            log("\nDetenido.")
            break
        except Exception as exc:
            log(f"Error: {exc}", "ERROR")
            time.sleep(INTERVAL)


def parse_args():
    parser = argparse.ArgumentParser(description="ESIG scraper with HubSpot ticket creation.")
    parser.add_argument("--once", action="store_true", help="Ejecuta una sola verificacion.")
    parser.add_argument("--skip-hubspot", action="store_true", help="No crea tickets en HubSpot.")
    parser.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES, help="Limita paginas para pruebas.")
    return parser.parse_args()


if __name__ == "__main__":
    import sys

    args = parse_args()
    if args.once:
        sys.exit(0 if run_once(max_pages=args.max_pages, skip_hubspot=args.skip_hubspot) else 1)
    else:
        run_continuous(max_pages=args.max_pages, skip_hubspot=args.skip_hubspot)
