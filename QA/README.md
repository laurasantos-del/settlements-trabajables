# ESIG Auto-Scraper – Electronic Signature Library

Sistema automatizado que cada 1 hora extrae la lista completa de documentos de la
seccion **Electronic Signature Library** de DebtTrakker / Leadsconnection
(`https://secure.debttrakker.net/Manager.aspx?mid=6&sid=50`), detecta cambios y
crea un ticket en HubSpot cuando un cliente (agrupado por `LeadID`) alcanza
**90 % o mas** de documentos firmados.

---

## 1. Instalacion

```bash
python3 -m pip install -r requirements.txt
```

`requirements.txt` instala: `requests`, `beautifulsoup4`, `cryptography`,
`urllib3<2`.

---

## 2. Configuracion de secretos (cifrada, una sola vez)

Las cookies de DebtTrakker y el token de HubSpot **nunca** se escriben en
texto plano dentro del codigo. Se guardan cifrados con Fernet en
`.secrets.enc`, usando la clave en `.secret.key`.

### 2.1. Inicializar archivos

```bash
python3 manage_secrets.py --init
```

### 2.2. Cargar cookies de DebtTrakker

Modo interactivo (recomendado, no muestra los valores en pantalla):

```bash
python3 manage_secrets.py --set-cookies
```

Cookies requeridas:

- `LCCurrentSessionID`
- `LCUID`
- `Leads_Manager`

Cookies opcionales (ayudan si DebtTrakker exige varios campos):

- `Leads_Office`
- `Leads_OfficeID`
- `Leads_Department`
- `Leads_EmployeeType`
- `IsLoggedOut`

#### Como sacar las cookies del navegador

1. Inicia sesion en https://secure.debttrakker.net desde Chrome.
2. Abre DevTools (`F12`) -> pestana **Application** -> **Cookies** -> `secure.debttrakker.net`.
3. Copia los valores de las cookies de arriba.
4. Pegalos cuando `manage_secrets.py --set-cookies` los pida.

### 2.3. Cargar configuracion de HubSpot

```bash
python3 manage_secrets.py --set-hubspot
```

Campos:

- `HUBSPOT_ACCESS_TOKEN`  *(requerido, formato `pat-na1-...`)*
- `HUBSPOT_PIPELINE`       *(requerido, ID del pipeline de tickets)*
- `HUBSPOT_PIPELINE_STAGE` *(requerido, ID interno del stage)*
- `HUBSPOT_TICKET_PRIORITY` *(requerido, default `HIGH`)*
- `HUBSPOT_OWNER_ID`        *(opcional, ID numerico del owner)*

### 2.4. Verificar sin revelar valores

```bash
python3 manage_secrets.py --status
```

Muestra `configurada / NO configurada` por cada cookie y campo de HubSpot.
Los valores sensibles se muestran enmascarados (`abc***xyz`).

### 2.5. Reset

```bash
python3 manage_secrets.py --reset
```

Borra `.secrets.enc` y `.secret.key`. Despues hay que reingresar todo.

---

## 3. Prueba (sin crear tickets reales)

```bash
python3 esig_scraper.py --once --max-pages 1 --skip-hubspot
```

- Solo trae la primera pagina.
- No llama a HubSpot.
- Util para validar autenticacion y parseo.

Si las cookies expiraron, el log lo dira claramente y dara instrucciones
exactas para actualizarlas.

---

## 4. Ejecucion

### 4.1. Una sola vez (completa)

```bash
python3 esig_scraper.py --once
```

### 4.2. Modo continuo (cada 1 hora)

```bash
python3 esig_scraper.py
```

En segundo plano:

```bash
nohup python3 esig_scraper.py > /dev/null 2>&1 &
```

### 4.3. Como servicio (alternativas)

- macOS: `launchd` plist apuntando a `python3 /ruta/esig_scraper.py`
- Linux: `systemd` service o `cron` con `--once` cada hora:
  ```
  0 * * * * /usr/bin/python3 /ruta/esig_scraper.py --once >> /ruta/cron.log 2>&1
  ```

---

## 5. Logica de tickets HubSpot

- Los registros se agrupan por `LeadID`.
- Por cada LeadID se calculan: `total_docs`, `signed_docs`, `signed_percent`.
- Estados considerados como **firmado**: `signed`, `firmado`, `completed`,
  `complete`, `executed` (comparacion insensible a mayusculas/minusculas y
  por substring).
- Si `signed_docs / total_docs >= 0.90`, se crea un ticket en HubSpot via
  `POST https://api.hubapi.com/crm/v3/objects/tickets`.
- Los LeadID con ticket ya creado quedan registrados en
  `hubspot_tickets_created.json` para **no duplicar**.

### Payload enviado a HubSpot

```json
{
  "properties": {
    "subject": "ESIG 90% firmado - <Nombre Apellido> - LeadID <id>",
    "hs_pipeline": "<HUBSPOT_PIPELINE>",
    "hs_pipeline_stage": "<HUBSPOT_PIPELINE_STAGE>",
    "hs_ticket_priority": "<HUBSPOT_TICKET_PRIORITY>",
    "content": "Cliente alcanzo 95.0% firmado...",
    "hubspot_owner_id": "<HUBSPOT_OWNER_ID>"  // solo si se configuro
  }
}
```

---

## 6. Archivos generados

| Archivo                          | Que contiene                                     |
|----------------------------------|--------------------------------------------------|
| `esig_library_data.csv`          | Todos los registros de la ultima ejecucion.      |
| `esig_changes_log.json`          | Historial: que cambio entre ejecuciones.         |
| `esig_scraper.log`               | Log linea-a-linea de cada corrida.               |
| `hubspot_tickets_created.json`   | LeadIDs con ticket ya creado (anti-duplicado).   |
| `debug_debttrakker_response.html`| Solo se crea si el parseo falla, para inspeccion.|
| `.secrets.enc` / `.secret.key`   | Secretos cifrados + clave local.                 |

Todos estan en `.gitignore`.

---

## 7. Que pasa si la sesion expira

DebtTrakker invalida las cookies cuando:

- el usuario cierra sesion,
- ha pasado mucho tiempo sin actividad,
- el usuario inicia sesion en otro lado.

Cuando el scraper detecta que la respuesta es la pantalla de `Login.aspx`,
**termina la ejecucion** y escribe en `esig_scraper.log` algo como:

```
[ERROR] SESION DE DEBTTRAKKER EXPIRADA O COOKIES INVALIDAS
[ERROR] PARA ARREGLARLO:
[ERROR]   1. Abre Chrome, inicia sesion en https://secure.debttrakker.net
[ERROR]   2. Abre DevTools (F12) -> Application -> Cookies
[ERROR]   3. Copia los valores NUEVOS de LCCurrentSessionID, LCUID, Leads_Manager
[ERROR]   4. python3 manage_secrets.py --set-cookies
[ERROR]   5. python3 manage_secrets.py --status
[ERROR]   6. python3 esig_scraper.py --once --max-pages 1 --skip-hubspot
```

---

## 8. Estructura del repo

```
esig_scraper.py                # scraper principal
manage_secrets.py              # CLI de secretos cifrados
requirements.txt
.gitignore
.secrets.enc                   # ignorado por git (cifrado)
.secret.key                    # ignorado por git (clave local)
esig_library_data.csv          # ignorado por git
esig_changes_log.json          # ignorado por git
esig_scraper.log               # ignorado por git
hubspot_tickets_created.json   # ignorado por git
debug_debttrakker_response.html# ignorado por git
README.md
```

---

## 9. Validaciones rapidas

```bash
python3 -m py_compile esig_scraper.py manage_secrets.py
python3 manage_secrets.py --status
python3 esig_scraper.py --once --max-pages 1 --skip-hubspot
```
