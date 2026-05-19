import asyncio
import json
import os
import time
from datetime import datetime

import websockets
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager


load_dotenv()

DM_BASE = "https://secure.debtmanagersoft.com/dfreedomusa/system"
DM_USER = os.getenv("DM_USER", "")
DM_PASSWORD = os.getenv("DM_PASSWORD", "")
WS_URL = os.getenv("WS_URL", "ws://localhost:8000/ws/data")
HEADLESS = os.getenv("HEADLESS", "true").lower() == "true"
BATCH_SIZE = 40

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
]


def make_driver():
    opts = webdriver.ChromeOptions()
    if HEADLESS:
        opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1920,1080")
    return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)


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


def extract_rows(driver, report_name, fallback_cols, page):
    headers = [
        th.text.strip()
        for th in driver.find_elements(By.CSS_SELECTOR, "table thead th")
        if th.text.strip()
    ]
    if not headers:
        headers = fallback_cols

    records = []
    for row in driver.find_elements(By.CSS_SELECTOR, "table tbody tr"):
        cells = row.find_elements(By.TAG_NAME, "td")
        if not cells:
            continue
        record = {"_report": report_name, "_page": page}
        for index, cell in enumerate(cells):
            key = headers[index] if index < len(headers) else f"col_{index}"
            record[key] = cell.text.strip()
        records.append(record)
    return records


def scrape_report(driver, report):
    print(f"\n[DM] -- {report['title']} --")
    driver.get(report["url"])
    wait = WebDriverWait(driver, 20)
    all_records = []
    seen_pages = set()
    page = 1

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
        all_records.extend(batch)

        try:
            pagination_text = driver.find_element(
                By.XPATH,
                "//*[contains(text(),' of ') and contains(text(),'items')]",
            ).text.strip()
        except Exception:
            pagination_text = ""

        print(f"  -> Pag {page:>3}: {len(batch):>4} filas | total: {len(all_records):>5}  {pagination_text}")

        try:
            driver.find_element(By.XPATH, "//a[@title='Go to the next page']").click()
            page += 1
            time.sleep(0.5)
        except Exception:
            print(f"  {len(all_records)} registros extraidos")
            break

    return all_records


async def send_report(records, report_name):
    if not records:
        print(f"  Sin datos: {report_name}")
        return

    async with websockets.connect(WS_URL) as ws:
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
        for report in REPORTS:
            records = scrape_report(driver, report)
            await send_report(records, report["name"])
        completed = True
    finally:
        driver.quit()
        if completed:
            print("\nScraping completo - datos enviados al servidor")


if __name__ == "__main__":
    asyncio.run(main())
