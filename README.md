# Settlements Trabajables + DebtManager Scraper

App local para generar una lista diaria de settlements trabajables cruzando reportes de DebtManager y HubSpot. Incluye un servidor FastAPI con WebSocket y un scraper Selenium para DebtManager.

## Preparar Python

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Configurar credenciales

El archivo `.env` vive solo en tu maquina y no debe subirse a git. La plantilla publica es `.env.example`.

## Abrir

En una terminal:

```bash
source .venv/bin/activate
uvicorn server:app --reload --port 8000
```

En otra terminal, para ejecutar el scraper:

```bash
source .venv/bin/activate
python debtmanager_scraper.py
```

Para abrir la app visual:

```bash
python3 -m http.server 4173
```

Luego visita:

```text
http://127.0.0.1:4173/index.html
```

## Archivos

- **DebtManager report:** CSV, XLSX o XLS.
- **HubSpot deals export:** CSV, XLSX o XLS.
- **FastAPI:** boton `Cargar desde FastAPI`, que lee `GET /data/negotiator-escrow`.

La app intenta reconocer columnas con nombres comunes en ingles o espanol.

## Columnas recomendadas

DebtManager:

- `client_id`
- `client`
- `sid`
- `month`
- `escrow`
- `creditor`
- `debt_balance`
- `status`

HubSpot:

- `client_id`
- `client`
- `sid`
- `deal_name`
- `pipeline`
- `stage`
- `owner`

## Criterios

- Solo clientes `Active`.
- Filtro minimo configurable, por defecto `>= 40%`.
- Tier 1: fondos `>= 100%`.
- Tier 2: fondos `70-99%`.
- Tier 3: fondos `50-69%`.

## Exportes

- Markdown para pegar como reporte diario.
- CSV para trabajar en Excel, Sheets o HubSpot.

## Base de acreedores

La app carga `creditor_rules.json`, generado desde `Creditor DB.xlsx`. Al abrir un cliente desde la tabla, muestra sus cuentas, porcentaje esperado de settlement, pagos, observaciones y si el escrow alcanza para negociar segun esa regla. Si no existe regla para un acreedor, el detalle muestra una linea visual para definir `% objetivo`, pagos, dificultad y notas.

## Endpoints

| Metodo | URL | Descripcion |
|---|---|---|
| GET | `/data/client-savings-escrow` | CLIENT SAVINGS/ESCROW REPORT completo |
| GET | `/data/negotiator-escrow` | NEGOTIATOR/ESCROW REPORT completo |
| GET | `/data/summary` | Conteo de registros por reporte |
| DELETE | `/data/clear` | Limpia los datos en memoria |
