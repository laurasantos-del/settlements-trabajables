import asyncio
import json
import os
import platform
import re
import subprocess
import time
from datetime import date, datetime

import requests
import websockets
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager


load_dotenv()

DM_BASE = "https://secure.debtmanagersoft.com/dfreedomusa/system"
DM_USER = os.getenv("DM_USER", "")
DM_PASSWORD = os.getenv("DM_PASSWORD", "")
WS_URL = os.getenv("WS_URL", "ws://localhost:8000/ws/data")
HEADLESS = os.getenv("HEADLESS", "true").lower() == "true"
CLIENT_INTERACTIONS_URL = os.getenv(
    "CLIENT_INTERACTIONS_URL",
    f"{DM_BASE}/rpt_client_interactions.php",
)
NEW_ENROLLMENTS_URL = os.getenv(
    "NEW_ENROLLMENTS_URL",
    f"{DM_BASE}/rpt_new_enrollments_custom.php",
)
EXPECTED_CLIENT_PAYMENTS_URL = os.getenv(
    "EXPECTED_CLIENT_PAYMENTS_URL",
    f"{DM_BASE}/rpt_expected_client_pmts_custom.php",
)
SETTLEMENT_PAYMENT_REPORT_URL = os.getenv(
    "SETTLEMENT_PAYMENT_REPORT_URL",
    f"{DM_BASE}/rpt_settlement_pmts_custom.php",
)
SETTLEMENTS_PER_DATE_URL = os.getenv(
    "SETTLEMENTS_PER_DATE_URL",
    f"{DM_BASE}/rpt_settlements_per_date.php",
)
PAYMENTS_CLEARED_URL = os.getenv(
    "PAYMENTS_CLEARED_URL",
    f"{DM_BASE}/rpt_payments_cleared_custom.php",
)
COMMISSIONS_URL = os.getenv(
    "COMMISSIONS_URL",
    f"{DM_BASE}/rpt_commissions.php",
)
PROJECTED_FEES_URL = os.getenv(
    "PROJECTED_FEES_URL",
    f"{DM_BASE}/rpt_projected_fees_custom.php",
)
PAYMENT_NSF_URL = os.getenv(
    "PAYMENT_NSF_URL",
    f"{DM_BASE}/rpt_nsf_custom.php",
)
SUMMARY_REPORT_URL = os.getenv(
    "SUMMARY_REPORT_URL",
    f"{DM_BASE}/reports.php",
)
SUSPENDED_PAYMENTS_URL = os.getenv(
    "SUSPENDED_PAYMENTS_URL",
    f"{DM_BASE}/rpt_suspended_payment_plan_custom.php",
)
CREDITOR_STATUS_URL = os.getenv(
    "CREDITOR_STATUS_URL",
    f"{DM_BASE}/rpt_creditor_status_by_date_range.php",
)
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "40"))
SEND_DURING_SCRAPE = os.getenv("SEND_DURING_SCRAPE", "true").lower() == "true"
REPORTS_ONLY = {
    item.strip()
    for item in os.getenv("REPORTS_ONLY", "").split(",")
    if item.strip()
}

REPORTS = [
    {
        "name": "client_savings_escrow",
        "title": "CLIENT SAVINGS/ESCROW REPORT",
        "url": f"{DM_BASE}/rpt_client_savings_escrow.php",
        "columns": [
            "Client ID",
            "Client Name",
            "Client Balance",
            "# Of Creditors",
            "# Of Creditors Not Settled",
            "ClientServiceID",
            "Negotiator Rep",
            "Sett In Progress",
            "Current Month Available",
            "Next Month Available",
            "Next Month Available 2",
            "Creditor Name",
            "Creditor Balance",
        ],
    },
    {
        "name": "negotiator_escrow",
        "title": "NEGOTIATOR/ESCROW REPORT",
        "url": f"{DM_BASE}/rpt_negotiator_savings_escrow.php",
        "columns": [
            "Client ID",
            "Client Name",
            "Client Status",
            "Sid",
            "Month Completed In The Program",
            "Last Payment Date",
            "Original Creditor",
            "Collection Agency",
            "Original Balance",
            "Current Account Balance",
            "Account Number",
            "Available Funds In Escrow Account",
            "% Of Funds Available",
        ],
    },
    {
        "name": "client_interactions",
        "title": "CLIENT INTERACTIONS REPORT",
        "url": CLIENT_INTERACTIONS_URL,
        "kendo": True,
        "kendo_dom": True,
        "kendo_table": "client",
        "fields": [
            ("clientid", "Client ID"),
            ("firstname", "First Name"),
            ("lastname", "Last Name"),
            ("gender", "Gender"),
            ("client_age", "Client Age"),
            ("address", "Address"),
            ("city", "City"),
            ("state", "State"),
            ("postal", "Postal"),
            ("phone", "Phone"),
            ("mobile", "Mobile"),
            ("work", "Work"),
            ("sid", "SSN"),
            ("email", "Email"),
            ("speaks_spanish", "Speaks Spanish"),
            ("date_of_birth", "Date Of Birth"),
            ("payroll_schedule", "Payroll Schedule"),
            ("day_of_month1", "Day Of month 1"),
            ("day_of_month2", "Day Of month 2"),
            ("coapplicant_name", "Co-applicant name"),
            ("coapp_ssn", "Co-app ssn"),
            ("coapp_zip", "Co-app zip"),
            ("programid", "Program"),
            ("client_status", "Client Status"),
            ("file_status", "File Status"),
            ("days_in_client_status", "Days In Client Status"),
            ("days_in_file_status", "Days In File Status"),
            ("cftpay_escrow_balance", "CFTPay Escrow Balance"),
            ("company_bank_balance", "Company Bank Balance"),
            ("enrolled_date", "Enrollment Date"),
            ("monthly_payment_date", "Monthly Payment Date"),
            ("monthly_payment_amt", "Monthly Payment Amount"),
            ("nbr_months", "Total Number of Months"),
            ("initial_pmt_dt", "Initial Payment Date($50)"),
            ("first_pmt_dt", "First Payment Date (Remainder Or full Amount)"),
            ("scheduled_welcomecall", "Welcome Call Schedule"),
            ("completed_welcomecall", "Welcome Call Completion Date"),
            ("last_pmt_dt", "Last Payment Date"),
            ("pmt_months_completed", "Payment Months Completed"),
            ("pmt_months_skipped", "Payment Months Skipped"),
            ("pmt_months_nsf", "Payment Months NSF"),
            ("pmt_months_pending", "Payment Months Remaining"),
            ("enrolled_creditors", "Total Number of Accounts Enrolled"),
            ("total_debt", "Total Enrolled Debt"),
            ("settlement_fee_percentage", "Settlement Fee Percentage"),
            ("cs_rep", "CS Rep"),
            ("sales_rep", "Sales Rep"),
            ("veritas_plan", "Prepaid Legal"),
            ("cftpay_account_id", "CFTPay Account"),
            ("loan_program", "Loan Program"),
            ("cancellation_reasons", "Cancellation Reasons"),
            ("veritas_type", "Veritas Type"),
            ("enrollment_fee_spread", "Enrollment Fee Spread"),
            ("settlement_fee", "Settlement Fee"),
            ("veritas_monthly_fee", "Veritas Monthly Fee"),
            ("bank_fee", "Bank Fee"),
            ("reduced_debt_amt", "Reduced Debt Amount"),
            ("total_savings", "Total Savings"),
            ("next_schedulled_payment_dt", "Next Schedulled Payment Date"),
            ("final_draft_date", "Final Draft Date"),
            ("last_note_date", "Last Note Date"),
            ("last_note", "Last Note"),
            ("open_tasks", "Number Of Tasks Outstanding"),
            ("closed_tasks", "Number Of Tasks Completed"),
            ("last_nsf_date", "Last NSF Date"),
            ("bank_name", "Bank Name"),
            ("bank_routing_nbr", "Bank Routing Nbr"),
            ("bank_account_nbr", "Bank Account Nbr"),
            ("debit_card_nbr", "Debit Card Nbr"),
            ("ExpDate", "Expiration Date"),
            ("CVV", "CVV"),
        ],
        "columns": [],
    },
    {
        "name": "new_enrollments",
        "title": "NEW ENROLLMENTS",
        "url": NEW_ENROLLMENTS_URL,
        "kendo": True,
        "kendo_table": "client",
        "fields": [
            ("clientid", "Lead Number"),
            ("client_status", "Pipeline Status"),
            ("client_status_dt", "Status Date"),
            ("client_name", "Client"),
            ("gender", "Gender"),
            ("state", "State"),
            ("postal", "Zip"),
            ("age", "Client Age"),
            ("debt_total", "Total Debt"),
            ("settle_fee_percentage", "Settle Fee Percentage"),
            ("service_fee", "Service Fee"),
            ("nbr_months", "Program Term"),
            ("first_draft_dt", "First Draft Date"),
            ("enrolled_dt", "Enroll Date"),
            ("oprid_salesrep", "Debt Consultant"),
            ("programid", "Program"),
            ("dt_client_id", "Lead ID"),
        ],
        "columns": [],
    },
    {
        "name": "expected_client_payments",
        "title": "EXPECTED CLIENT PAYMENTS REPORT",
        "url": EXPECTED_CLIENT_PAYMENTS_URL,
        "kendo": True,
        "kendo_dom": True,
        "kendo_table": "client",
        "fields": [
            ("clientid", "Client ID"),
            ("firstname", "First Name"),
            ("lastname", "Last Name"),
            ("client_status", "Client Status"),
            ("client_status_dt", "Days In Client Status"),
            ("file_status", "File Status"),
            ("file_status_dt", "Days In File Status"),
            ("state", "State"),
            ("fst_draft", "First Draft"),
            ("effdt", "Scheduled Draft Date"),
            ("amount", "Amount"),
            ("payment_status", "Payment Status"),
            ("pend_date", "Pending Draft Date"),
            ("processed_date", "Processed Draft Date"),
        ],
        "columns": [],
    },
    {
        "name": "settlement_payment_report",
        "title": "SETTLEMENT PAYMENT REPORT",
        "url": SETTLEMENT_PAYMENT_REPORT_URL,
        "kendo": True,
        "kendo_dom": True,
        "kendo_table": "client",
        "fields": [
            ("programid", "Program"),
            ("clientid", "Client ID"),
            ("firstname", "Firstname"),
            ("lastname", "Lastname"),
            ("client_creditor_id", "Current Creditor"),
            ("payment_number", "Payment Number"),
            ("cleared_payments", "Completed Payments"),
            ("total_payments", "Total Number Of Payments"),
            ("effdt", "Due Date"),
            ("amount", "Amount"),
            ("used", "Payment Status"),
            ("payment_type", "Method"),
            ("file_status", "File Status"),
            ("client_status", "Accouting Status"),
            ("debt_total", "Total Debt"),
            ("balance", "Balance"),
            ("balance_current", "Balance Current"),
        ],
        "columns": [],
    },
    {
        "name": "settlements_per_date",
        "title": "SETTLED CLIENTS PER DATE",
        "url": SETTLEMENTS_PER_DATE_URL,
        "kendo": True,
        "kendo_table": "client",
        "fields": [
            ("clientid", "Client ID"),
            ("firstname", "Firstname"),
            ("lastname", "Lastname"),
            ("state", "State"),
            ("email", "Email"),
            ("name", "Name"),
            ("oprid_neg", "Negotiator"),
            ("settle_letter_dt", "Settlement Letter Date"),
            ("settlement_percentage", "Settlement Percentage"),
            ("settle_payment_dt", "Settlement Payment Date"),
            ("balance_at_settlement", "Balance At Settlement"),
            ("settle_amount", "Settlement Amount"),
            ("amount", "Settlement Fee"),
        ],
        "columns": [],
    },
    {
        "name": "payments_cleared",
        "title": "PAYMENTS CLEARED REPORT",
        "url": PAYMENTS_CLEARED_URL,
        "kendo": True,
        "kendo_dom": True,
        "kendo_table": "client",
        "fields": [
            ("clientid", "Client ID"),
            ("programid", "Program"),
            ("date", "Date"),
            ("oprid_salesrep", "SalesRepID"),
            ("name", "Name"),
            ("total_debt", "Total Debt"),
            ("payment_nbr", "Pmt #"),
            ("draft_amount", "Draft Amount"),
            ("retainer_amount", "Retainer Amount"),
            ("service_fee_amount", "Service Fee Amount"),
            ("legal_fee_amount", "Legal Fee Amount"),
            ("trust_fee_amount", "Trust Fee Amount"),
            ("saving_amount", "Saving Amount"),
            ("date_cleared", "Date Cleared"),
            ("client_status", "Client Status"),
            ("account", "Account"),
            ("client_status_dt", "Active Status Date"),
        ],
        "columns": [],
    },
    {
        "name": "commissions",
        "title": "COMMISSION REPORT",
        "url": COMMISSIONS_URL,
        "columns": [
            "User ID",
            "Name",
            "Hire Date",
            "Title",
            "Primary Group",
            "Pays for Leads",
            "Cost Per Lead for Rep",
            "Commission Plan",
            "Percent",
        ],
    },
    {
        "name": "projected_fees",
        "title": "PROJECTED FEES REPORT",
        "url": PROJECTED_FEES_URL,
        "kendo": True,
        "kendo_table": "client",
        "fields": [
            ("clientid", "Client ID"),
            ("firstname", "First Name"),
            ("lastname", "Last Name"),
            ("client_status", "Client Status"),
            ("file_status", "File Status"),
            ("state", "State"),
            ("effdt", "Date"),
            ("creditor_original_balance", "Creditor Original Balance"),
            ("fee_percentage", "Fee Percentage"),
            ("amount", "Projected Fee"),
            ("payment_status", "Payment Status"),
        ],
        "columns": [],
    },
    {
        "name": "payment_nsf",
        "title": "PAYMENT NSF REPORT",
        "url": PAYMENT_NSF_URL,
        "kendo": True,
        "kendo_dom": True,
        "kendo_table": "client",
        "fields": [
            ("effdt", "Date Of Draft / Fee"),
            ("clientid", "Client ID"),
            ("oprid_salesrep", "SalesRepID"),
            ("firstname", "Firstname"),
            ("lastname", "Lastname"),
            ("amount", "Amount"),
            ("file_status", "File Status"),
            ("client_status", "Accouting Status"),
            ("cleared_payments", "Cleared Payments"),
            ("programid", "Program"),
            ("last_nsf_date", "Last NSF Date"),
            ("nsf_count", "Number Of NSFs"),
            ("nsf_error", "Last NSF Error"),
        ],
        "columns": [],
    },
    {
        "name": "summary_report",
        "title": "SUMMARY REPORT",
        "url": SUMMARY_REPORT_URL,
        "summary": True,
        "columns": [],
    },
    {
        "name": "suspended_payments",
        "title": "SUSPENDED PAYMENT PLANS REPORT",
        "url": SUSPENDED_PAYMENTS_URL,
        "kendo": True,
        "kendo_table": "client",
        "fields": [
            ("clientid", "Client ID"),
            ("programid", "Program"),
            ("firstname", "Firstname"),
            ("lastname", "Lastname"),
            ("client_status", "Current Program Status"),
        ],
        "columns": [],
    },
    {
        "name": "creditor_status",
        "title": "CREDITOR STATUS REPORT",
        "url": CREDITOR_STATUS_URL,
        "kendo": True,
        "kendo_dom": True,
        "kendo_table": "client_creditor",
        "fields": [
            ("clientid", "Client ID"),
            ("client_status", "Client Status"),
            ("lastname", "Lastname"),
            ("phone", "Phone"),
            ("company_name", "Company Name"),
            ("creditorid", "Creditorid"),
            ("new_creditor_id", "New Creditor ID"),
            ("creditor_status", "Creditor Status"),
            ("Creditor_Name", "Creditor Name"),
            ("Status_Date", "Status Date"),
            ("oprid_neg", "NegotiatorID"),
            ("settle_payment_dt", "Settle Payment Date"),
            ("settlement_pmt_due_dt", "Settlement Pmt Due Date"),
        ],
        "columns": [],
    },
]


CHROME_BIN = os.getenv("CHROME_BIN", "")
CHROMEDRIVER_BIN = os.getenv("CHROMEDRIVER_BIN", "")


def _codesign_if_needed(path: str) -> None:
    """On macOS, newly-downloaded ChromeDrivers are killed by Gatekeeper unless ad-hoc signed."""
    if platform.system() != "Darwin":
        return
    try:
        result = subprocess.run(
            [path, "--version"],
            capture_output=True,
            timeout=5,
        )
        if result.returncode == 0:
            return
        subprocess.run(
            ["codesign", "--sign", "-", "--force",
             "--preserve-metadata=entitlements,requirements,flags,runtime", path],
            check=True,
            capture_output=True,
        )
        print(f"[ChromeDriver] Ad-hoc signed: {path}")
    except Exception as exc:
        print(f"[ChromeDriver] codesign check/fix failed: {exc}")


def make_driver():
    opts = webdriver.ChromeOptions()
    if HEADLESS:
        opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1920,1080")
    opts.add_argument("--remote-debugging-port=9222")

    # In Docker/cloud: use system Chrome set via env vars
    # Locally: webdriver_manager downloads the right ChromeDriver automatically
    if CHROME_BIN:
        opts.binary_location = CHROME_BIN
    if CHROMEDRIVER_BIN:
        driver_path = CHROMEDRIVER_BIN
    else:
        driver_path = ChromeDriverManager().install()

    _codesign_if_needed(driver_path)
    service = Service(driver_path)
    return webdriver.Chrome(service=service, options=opts)


def login(driver):
    if not DM_USER or not DM_PASSWORD:
        raise RuntimeError("Faltan DM_USER o DM_PASSWORD en el archivo .env")

    print("[DM] Iniciando sesion...")
    driver.get(f"{DM_BASE}/")
    wait = WebDriverWait(driver, 15)
    try:
        wait.until(EC.presence_of_element_located((By.NAME, "username"))).send_keys(DM_USER)
    except TimeoutException:
        save_login_diagnostics(driver)
        raise
    driver.find_element(By.NAME, "password_temp").send_keys(DM_PASSWORD)
    driver.find_element(By.CSS_SELECTOR, "input[type='submit'], button[type='submit']").click()
    wait.until(lambda d: "username" not in d.page_source.lower() or "home.php" in d.current_url)
    print("[DM] Login exitoso")


def save_login_diagnostics(driver):
    print(f"[DM] No aparecio el campo de login. URL actual: {driver.current_url}")
    print(f"[DM] Titulo actual: {driver.title}")
    with open("debtmanager_login_debug.html", "w", encoding="utf-8") as handle:
        handle.write(driver.page_source)
    driver.save_screenshot("debtmanager_login_debug.png")
    print("[DM] Diagnostico guardado: debtmanager_login_debug.html y debtmanager_login_debug.png")


def extract_rows_once(driver, report_name, fallback_cols, page):
    table = driver.execute_script(
        """
        const tables = Array.from(document.querySelectorAll('table'));
        let best = null;
        for (const table of tables) {
          const rows = Array.from(table.querySelectorAll('tbody tr'));
          const bodyRows = rows
            .map(tr => Array.from(tr.querySelectorAll('td')).map(td => (td.innerText || td.textContent || '').replace(/\\s+/g, ' ').trim()))
            .filter(cells => cells.some(Boolean));
          if (!bodyRows.length) continue;
          const headers = Array.from(table.querySelectorAll('thead th'))
            .map(th => (th.innerText || th.textContent || '').replace(/\\s+/g, ' ').trim())
            .filter(Boolean);
          if (!best || bodyRows.length > best.rows.length) best = {headers, rows: bodyRows};
        }
        return best || {headers: [], rows: []};
        """
    )
    headers = table.get("headers") or []
    if not headers:
        headers = fallback_cols

    records = []
    for cells in table.get("rows") or []:
        if not cells:
            continue
        record = {"_report": report_name, "_page": page}
        for index, value in enumerate(cells):
            key = headers[index] if index < len(headers) else f"col_{index}"
            record[key] = value
        # Filter garbage rows (navigation text, headers, empty rows)
        # For reports where Client ID is the first column, skip non-numeric IDs
        client_id_reports = {"client_interactions", "client_savings_escrow", "negotiator_escrow", "commissions"}
        if report_name in client_id_reports:
            cid = str(record.get("Client ID") or record.get("User ID") or "").strip()
            if cid and not cid.isdigit():
                continue
        # Skip any row where the first cell is suspiciously long (navigation menus)
        first_cell = cells[0] if cells else ""
        if len(first_cell) > 80:
            continue
        records.append(record)
    return records


def extract_rows(driver, report_name, fallback_cols, page):
    for attempt in range(3):
        try:
            return extract_rows_once(driver, report_name, fallback_cols, page)
        except StaleElementReferenceException:
            if attempt == 2:
                raise
            time.sleep(0.7)
    return []


def selected_reports():
    reports = [report.copy() for report in REPORTS]
    if os.getenv("PAYMENTS_CLEARED_USE_API", "false").lower() == "true":
        for report in reports:
            if report.get("name") == "payments_cleared":
                report["kendo_dom"] = False
    if not REPORTS_ONLY:
        return reports
    return [report for report in reports if report.get("name") in REPORTS_ONLY]


def max_pages_for(report_name):
    env_name = f"{report_name.upper()}_MAX_PAGES"
    raw_value = os.getenv(env_name, "").strip()
    if not raw_value:
        return None
    try:
        return int(raw_value)
    except ValueError:
        raise RuntimeError(f"{env_name} debe ser un numero entero")


class WebSocketReportSender:
    def __init__(self, report_name):
        self.report_name = report_name
        self.ws = None
        self.sent = 0
        self.batch_index = 0

    async def __aenter__(self):
        self.ws = await websockets.connect(WS_URL, ping_interval=None)
        print(f"\n[WS] Streaming '{self.report_name}' hacia {WS_URL}...")
        await self.ws.send(
            json.dumps(
                {
                    "source": "debtmanager",
                    "event": "ping",
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )
        )
        await self.ws.recv()
        await self.ws.send(
            json.dumps(
                {
                    "source": "debtmanager",
                    "event": "start",
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": {"report": self.report_name},
                }
            )
        )
        await self.ws.recv()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if self.ws:
            await self.ws.close()

    async def send_batch(self, records):
        if not records:
            return
        for index in range(0, len(records), BATCH_SIZE):
            chunk = records[index : index + BATCH_SIZE]
            await self.ws.send(
                json.dumps(
                    {
                        "source": "debtmanager",
                        "event": "batch",
                        "timestamp": datetime.utcnow().isoformat(),
                        "data": chunk,
                    }
                )
            )
            ack = json.loads(await self.ws.recv())
            self.batch_index += 1
            self.sent += len(chunk)
            print(
                f"  -> WS lote {self.batch_index:>3} | pagina: +{len(chunk):>3} | servidor: {ack.get('count')}"
            )
            await asyncio.sleep(0.03)

    async def finish(self):
        await self.ws.send(
            json.dumps(
                {
                    "source": "debtmanager",
                    "event": "done",
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": {"report": self.report_name, "total": self.sent},
                }
            )
        )
        done = json.loads(await self.ws.recv())
        print(f"  Servidor confirmo: {done.get('total')} registros guardados")


def make_session_from_driver(driver):
    session = requests.Session()
    for cookie in driver.get_cookies():
        session.cookies.set(cookie["name"], cookie["value"], domain=cookie.get("domain"))
    session.headers.update({"User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest"})
    return session


def parse_jsonp(text):
    match = re.match(r"^[^(]+\((.*)\)\s*;?\s*$", text, re.S)
    if not match:
        raise RuntimeError(f"Respuesta Kendo inesperada: {text[:120]}")
    return json.loads(match.group(1))


def get_kendo_payload(session, url, params, attempts=4):
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            response = session.get(url, params=params, timeout=90)
            response.raise_for_status()
            return parse_jsonp(response.text)
        except Exception as exc:
            last_error = exc
            wait = min(2 * attempt, 8)
            print(f"  Reintento Kendo {attempt}/{attempts} en {wait}s: {exc}")
            time.sleep(wait)
    raise RuntimeError(f"No pude leer Kendo despues de {attempts} intentos: {last_error}")


def current_month_range():
    today = date.today()
    return today.replace(day=1).isoformat(), today.isoformat()


def settlements_per_date_range():
    return os.getenv("SETTLEMENTS_PER_DATE_START", "2026-01-01"), os.getenv(
        "SETTLEMENTS_PER_DATE_END",
        date.today().isoformat(),
    )


def new_enrollments_date_range():
    today = date.today().isoformat()
    return os.getenv("NEW_ENROLLMENTS_START", "2026-01-01"), os.getenv("NEW_ENROLLMENTS_END", today)


def summary_key(section, label):
    key = re.sub(r"\s*\[\s*detail\s*\]\s*", "", label, flags=re.I).strip()
    key = re.sub(r"\s+", " ", key)
    return f"{section} - {key}" if section else key


def looks_like_date(value):
    text = str(value or "").strip()
    return bool(
        re.match(r"^\d{4}-\d{2}-\d{2}", text)
        or re.match(r"^\d{1,2}/\d{1,2}/\d{2,4}", text)
    )


def normalize_new_enrollment_record(record):
    enroll_date = str(record.get("Enroll Date", "")).strip()
    lead_number = str(record.get("Lead Number", "")).strip()
    status_date = str(record.get("Status Date", "")).strip()
    report_date = str(record.get("Report Date End") or record.get("Report Date Start") or "").strip()
    if enroll_date == lead_number or enroll_date.isdigit() or not looks_like_date(enroll_date):
        if status_date:
            record["Enroll Date"] = status_date
        elif report_date:
            record["Enroll Date"] = report_date
    return record


def kendo_record(report, row, page):
    record = {"_report": report["name"], "_page": page}
    for field, label in report["fields"]:
        record[label] = row.get(field, "")
    if report["name"] == "new_enrollments":
        date_start, date_end = report.get("_date_range", ("", ""))
        if date_start:
            record["Report Date Start"] = date_start
        if date_end:
            record["Report Date End"] = date_end
        normalize_new_enrollment_record(record)
    return record


async def scrape_kendo_report(driver, report, sender=None):
    if report.get("kendo_dom"):
        return await scrape_kendo_dom_report(driver, report, sender)

    print(f"\n[DM] -- {report['title']} --")
    print(f"  URL: {report['url']}")
    driver.get(report["url"])
    time.sleep(1.0)

    if report["name"] == "new_enrollments":
        date_start, date_end = new_enrollments_date_range()
        report["_date_range"] = (date_start, date_end)
        print(f"  Filtro aplicado: date_start={date_start} date_end={date_end}")

    if report["name"] == "settlements_per_date":
        date_start, date_end = settlements_per_date_range()
        try:
            driver.execute_script(
                """
                document.getElementsByName('date_start')[0].value = arguments[0];
                document.getElementsByName('date_end')[0].value = arguments[1];
                """,
                date_start,
                date_end,
            )
            driver.find_element(By.NAME, "Enter").click()
            time.sleep(1.5)
            print(f"  Filtro aplicado: date_start={date_start} date_end={date_end}")
        except Exception as exc:
            print(f"  No pude aplicar filtros en settlements_per_date: {exc}")

    if report["name"] == "commissions":
        body = driver.find_element(By.TAG_NAME, "body").text
        if "comm plan is invalid" in body.lower():
            print("  Commission plan invalido para este usuario; no hay filas para extraer")
            return [] if not sender else 0

    session = make_session_from_driver(driver)
    if report["name"] == "new_enrollments":
        date_start, date_end = report.get("_date_range", new_enrollments_date_range())
        session.post(report["url"], data={"date_start": date_start, "date_end": date_end, "Enter": "Enter"}, timeout=30)

    page_size = int(os.getenv(f"{report['name'].upper()}_PAGE_SIZE", os.getenv("KENDO_PAGE_SIZE", "200")))
    max_pages = max_pages_for(report["name"])
    total_sent = 0
    all_records = []
    page = 1

    while True:
        skip = (page - 1) * page_size
        params = {
            "ktbl": report.get("kendo_table", "client"),
            "callback": "dmjsonp",
            "page": page,
            "pageSize": page_size,
            "skip": skip,
            "take": page_size,
        }
        payload = get_kendo_payload(session, report["url"], params)
        rows = payload.get("results", [])
        total = int(payload.get("count") or 0)
        batch = [kendo_record(report, row, page) for row in rows]

        if sender:
            await sender.send_batch(batch)
        else:
            all_records.extend(batch)
        total_sent += len(batch)
        print(f"  -> Pag {page:>4}: {len(batch):>4} filas | total: {total_sent:>6} / {total}")

        if not rows or total_sent >= total:
            break
        if max_pages and page >= max_pages:
            print(f"  Limite {max_pages} paginas alcanzado para {report['name']}")
            break
        page += 1

    return all_records if not sender else total_sent


def extract_kendo_dom_rows(driver, report_name, page):
    grid = driver.execute_script(
        """
        const headers = Array.from(document.querySelectorAll('#grid .k-grid-header th'))
          .map(th => (th.innerText || th.textContent || '').replace(/\\s+/g, ' ').trim())
          .filter(Boolean);
        const rows = Array.from(document.querySelectorAll('#grid .k-grid-content tbody tr'))
          .map(tr => Array.from(tr.querySelectorAll('td')).map(td => (td.innerText || td.textContent || '').trim()))
          .filter(cells => cells.length);
        const pager = (document.querySelector('.k-pager-info')?.innerText || '').trim();
        return {headers, rows, pager};
        """
    )
    headers = grid.get("headers") or []
    pager = grid.get("pager") or ""
    expected_count = None
    match = re.search(r"(\d+)\s*-\s*(\d+)\s+of\s+(\d+)", pager)
    if match:
        start, end, _total = [int(part) for part in match.groups()]
        expected_count = max(0, end - start + 1)

    records = []
    rows = grid.get("rows") or []
    if expected_count is not None:
        rows = rows[:expected_count]
    for cells in rows:
        record = {"_report": report_name, "_page": page}
        for index, value in enumerate(cells):
            key = headers[index] if index < len(headers) else f"col_{index}"
            record[key] = value
        records.append(record)
    return records


async def scrape_kendo_dom_report(driver, report, sender=None):
    print(f"\n[DM] -- {report['title']} --")
    print(f"  URL: {report['url']}")
    driver.get(report["url"])
    wait = WebDriverWait(driver, 30)
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#grid .k-grid-content tbody tr")))
    page_size = int(os.getenv(f"{report['name'].upper()}_PAGE_SIZE", os.getenv("KENDO_PAGE_SIZE", "200")))
    if page_size != 40:
        driver.execute_script('jQuery("#grid").data("kendoGrid").dataSource.pageSize(arguments[0]);', page_size)
        time.sleep(3.0)

    all_records = []
    page = 1
    total_records = 0
    max_pages = max_pages_for(report["name"])
    seen_pages = set()

    while True:
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#grid .k-grid-content tbody tr")))
        time.sleep(0.4)
        batch = extract_kendo_dom_rows(driver, report["name"], page)
        page_signature = tuple(
            tuple((key, value) for key, value in record.items() if key != "_page")
            for record in batch
        )
        if page_signature in seen_pages:
            print(f"  Pag {page:>4}: pagina repetida detectada; reintento avance")
            time.sleep(1.0)
            batch = extract_kendo_dom_rows(driver, report["name"], page)
            page_signature = tuple(
                tuple((key, value) for key, value in record.items() if key != "_page")
                for record in batch
            )
            if page_signature in seen_pages:
                break
        seen_pages.add(page_signature)
        total_records += len(batch)
        if sender:
            await sender.send_batch(batch)
        else:
            all_records.extend(batch)

        try:
            pagination_text = driver.find_element(By.CSS_SELECTOR, ".k-pager-info").text.strip()
        except Exception:
            pagination_text = ""
        print(f"  -> Pag {page:>4}: {len(batch):>4} filas | total: {total_records:>6}  {pagination_text}")

        if not batch:
            break
        if max_pages and page >= max_pages:
            print(f"  Limite {max_pages} paginas alcanzado para {report['name']}")
            break
        try:
            next_button = driver.find_element(By.XPATH, "//a[@title='Go to the next page']")
            if "k-state-disabled" in (next_button.get_attribute("class") or ""):
                break
            previous_pagination = pagination_text
            next_button.click()
            page += 1
            if previous_pagination:
                WebDriverWait(driver, 10).until(
                    lambda d: d.find_element(By.CSS_SELECTOR, ".k-pager-info").text.strip() != previous_pagination
                )
            time.sleep(0.4)
        except Exception:
            break

    return all_records if not sender else total_records


async def scrape_summary_report(driver, report, sender=None):
    print(f"\n[DM] -- {report['title']} --")
    print(f"  URL: {report['url']}")
    driver.get(report["url"])
    time.sleep(1.0)
    body = driver.find_element(By.TAG_NAME, "body").text
    lines = [line.strip() for line in body.splitlines() if line.strip()]
    section = ""
    record = {"_report": report["name"], "_page": 1, "URL": driver.current_url}
    known_sections = {
        "Company Overview",
        "Client Count",
        "Setup Fee Income",
        "Retainer Fee Income",
        "Settlement Income",
        "Monthly Fee Income",
    }
    for line in lines:
        if line in known_sections:
            section = line
            continue
        if ":" not in line or not section:
            continue
        label, value = line.split(":", 1)
        label = label.strip()
        value = re.sub(r"\s*\[\s*detail\s*\]\s*", "", value, flags=re.I).strip()
        value = re.sub(r"\s+Detail$", "", value).strip()
        if label:
            record[summary_key(section, label)] = value
    records = [record] if len(record) > 3 else []
    if sender:
        await sender.send_batch(records)
        return len(records)
    return records


async def scrape_commissions_report(driver, report, sender=None):
    print(f"\n[DM] -- {report['title']} --")
    print(f"  URL: {report['url']}")
    date_start, date_end = current_month_range()
    driver.get(report["url"])
    time.sleep(1.0)
    try:
        driver.find_element(By.NAME, "date_start").clear()
        driver.find_element(By.NAME, "date_start").send_keys(date_start)
        driver.find_element(By.NAME, "date_end").clear()
        driver.find_element(By.NAME, "date_end").send_keys(date_end)
        driver.find_element(By.CSS_SELECTOR, "input[type='submit']").click()
        time.sleep(1.0)
        print(f"  POST aplicado: date_start={date_start} date_end={date_end}")
    except Exception as exc:
        print(f"  No pude aplicar filtros de fecha en commissions: {exc}")

    body = driver.find_element(By.TAG_NAME, "body").text
    if "comm plan is invalid" in body.lower():
        print("  Commissions no disponible: comm plan is invalid")
        return [] if not sender else 0

    batch = extract_rows(driver, report["name"], report["columns"], 1)
    if sender:
        await sender.send_batch(batch)
        return len(batch)
    return batch


async def scrape_report(driver, report, sender=None):
    if report.get("summary"):
        return await scrape_summary_report(driver, report, sender)
    if report.get("kendo"):
        return await scrape_kendo_report(driver, report, sender)
    if report.get("name") == "commissions":
        return await scrape_commissions_report(driver, report, sender)

    print(f"\n[DM] -- {report['title']} --")
    driver.get(report["url"])
    wait = WebDriverWait(driver, 20)
    all_records = []
    seen_pages = set()
    page = 1
    total_records = 0
    max_pages = max_pages_for(report["name"])

    while True:
        try:
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody tr")))
            time.sleep(0.6)
        except Exception:
            break

        batch = extract_rows(driver, report["name"], report["columns"], page)
        page_signature = tuple(
            tuple((key, value) for key, value in record.items() if key not in {"_page"})
            for record in batch
        )
        if page_signature in seen_pages:
            print(f"  Pag {page:>3}: pagina repetida detectada; cierro reporte")
            break
        seen_pages.add(page_signature)
        total_records += len(batch)
        if sender:
            await sender.send_batch(batch)
        else:
            all_records.extend(batch)

        try:
            pagination_text = driver.find_element(
                By.XPATH,
                "//*[contains(text(),' of ') and contains(text(),'items')]",
            ).text.strip()
        except Exception:
            pagination_text = ""

        print(f"  -> Pag {page:>3}: {len(batch):>4} filas | total: {total_records:>5}  {pagination_text}")

        if max_pages and page >= max_pages:
            print(f"  Limite {max_pages} paginas alcanzado para {report['name']}")
            break

        try:
            driver.find_element(By.XPATH, "//a[@title='Go to the next page']").click()
            page += 1
            time.sleep(0.5)
        except Exception:
            print(f"  {total_records} registros extraidos")
            break

    return all_records if not sender else total_records


async def send_report(records, report_name):
    if not records:
        print(f"  Sin datos: {report_name}")
        return

    async with websockets.connect(WS_URL, ping_interval=None) as ws:
        print(f"\n[WS] Enviando '{report_name}' ({len(records)} registros)...")
        await ws.send(
            json.dumps(
                {
                    "source": "debtmanager",
                    "event": "ping",
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )
        )
        await ws.recv()
        await ws.send(
            json.dumps(
                {
                    "source": "debtmanager",
                    "event": "start",
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": {"report": report_name},
                }
            )
        )
        await ws.recv()

        total_batches = (len(records) + BATCH_SIZE - 1) // BATCH_SIZE
        for index in range(0, len(records), BATCH_SIZE):
            await ws.send(
                json.dumps(
                    {
                        "source": "debtmanager",
                        "event": "batch",
                        "timestamp": datetime.utcnow().isoformat(),
                        "data": records[index : index + BATCH_SIZE],
                    }
                )
            )
            ack = json.loads(await ws.recv())
            print(f"  -> Lote {index // BATCH_SIZE + 1:>3}/{total_batches} | acumulado: {ack.get('count')}")
            await asyncio.sleep(0.03)

        await ws.send(
            json.dumps(
                {
                    "source": "debtmanager",
                    "event": "done",
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": {"report": report_name, "total": len(records)},
                }
            )
        )
        done = json.loads(await ws.recv())
        print(f"  Servidor confirmo: {done.get('total')} registros guardados")


async def main():
    driver = make_driver()
    completed = False
    try:
        login(driver)
        for report in selected_reports():
            if SEND_DURING_SCRAPE:
                async with WebSocketReportSender(report["name"]) as sender:
                    await scrape_report(driver, report, sender)
                    await sender.finish()
            else:
                records = await scrape_report(driver, report)
                await send_report(records, report["name"])
        completed = True
    finally:
        driver.quit()
        if completed:
            print("\nScraping completo - datos enviados al servidor")


if __name__ == "__main__":
    asyncio.run(main())
