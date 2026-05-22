#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
manage_secrets.py
-----------------
Gestiona secretos cifrados localmente para el scraper ESIG.

- Cookies de DebtTrakker / Leadsconnection
- Token y configuracion de HubSpot

Cifra con Fernet (clave en .secret.key) y guarda en .secrets.enc.
NUNCA escribe valores en texto plano dentro del codigo fuente.

Comandos principales:
  python3 manage_secrets.py --status
  python3 manage_secrets.py --set-cookies          # interactivo
  python3 manage_secrets.py --set-hubspot          # interactivo
  python3 manage_secrets.py --init                 # crea archivos vacios
  python3 manage_secrets.py --reset                # borra .secrets.enc y .secret.key

Compatibilidad (flags antiguos, no muestran valores en pantalla):
  python3 manage_secrets.py --session-id "..." --lcuid "..." --leads-manager "YES"
  python3 manage_secrets.py --hubspot-token "..." --hubspot-stage "..." --hubspot-pipeline "..."
"""
import argparse
import getpass
import json
import os
import sys

try:
    from cryptography.fernet import Fernet, InvalidToken
except ImportError:
    print("ERROR: falta el paquete 'cryptography'. Instalalo con:")
    print("       pip install cryptography")
    sys.exit(1)

DIR = os.path.dirname(os.path.abspath(__file__))
SECRETS_FILE = os.path.join(DIR, ".secrets.enc")
SECRET_KEY_FILE = os.path.join(DIR, ".secret.key")

# Cookies requeridas y opcionales (nombres reales tal como vienen en DebtTrakker)
REQUIRED_COOKIES = ["LCCurrentSessionID", "LCUID", "Leads_Manager"]
OPTIONAL_COOKIES = [
    "Leads_Office",
    "Leads_OfficeID",
    "Leads_Department",
    "Leads_EmployeeType",
    "IsLoggedOut",
]
ALL_COOKIES = REQUIRED_COOKIES + OPTIONAL_COOKIES

# Mapeo nombre-real-de-cookie  ->  variable de entorno que lee esig_scraper.py
COOKIE_TO_ENV = {
    "LCCurrentSessionID": "ESIG_COOKIE_LCCURRENTSESSIONID",
    "LCUID": "ESIG_COOKIE_LCUID",
    "Leads_Manager": "ESIG_COOKIE_LEADS_MANAGER",
    "Leads_Office": "ESIG_COOKIE_LEADS_OFFICE",
    "Leads_OfficeID": "ESIG_COOKIE_LEADS_OFFICEID",
    "Leads_Department": "ESIG_COOKIE_LEADS_DEPARTMENT",
    "Leads_EmployeeType": "ESIG_COOKIE_LEADS_EMPLOYEETYPE",
    "IsLoggedOut": "ESIG_COOKIE_ISLOGGEDOUT",
}

HUBSPOT_FIELDS = [
    ("HUBSPOT_ACCESS_TOKEN", True, True),    # requerido, secreto
    ("HUBSPOT_PIPELINE", True, False),       # requerido
    ("HUBSPOT_PIPELINE_STAGE", True, False), # requerido
    ("HUBSPOT_TICKET_PRIORITY", True, False),# requerido (default HIGH)
    ("HUBSPOT_OWNER_ID", False, False),      # opcional
]

DEFAULTS = {
    "ESIG_COOKIE_LEADS_OFFICE": "Debt Freedom LLC",
    "ESIG_COOKIE_LEADS_OFFICEID": "361",
    "ESIG_COOKIE_LEADS_DEPARTMENT": "SALES",
    "ESIG_COOKIE_LEADS_EMPLOYEETYPE": "STANDARD USER",
    "ESIG_COOKIE_ISLOGGEDOUT": "0",
    "HUBSPOT_TICKET_PRIORITY": "HIGH",
}


# ---------------------------------------------------------------------------
# Persistencia cifrada
# ---------------------------------------------------------------------------
def ensure_key():
    """Devuelve la clave Fernet, generandola si hace falta."""
    if os.path.exists(SECRET_KEY_FILE):
        with open(SECRET_KEY_FILE, "rb") as f:
            return f.read().strip()
    key = Fernet.generate_key()
    with open(SECRET_KEY_FILE, "wb") as f:
        f.write(key)
    try:
        os.chmod(SECRET_KEY_FILE, 0o600)
    except OSError:
        pass
    return key


def load_secrets():
    """Carga y descifra el archivo de secretos. Devuelve dict (posiblemente vacio)."""
    if not os.path.exists(SECRETS_FILE) or not os.path.exists(SECRET_KEY_FILE):
        return {}
    try:
        with open(SECRET_KEY_FILE, "rb") as f:
            key = f.read().strip()
        with open(SECRETS_FILE, "rb") as f:
            encrypted = f.read()
        return json.loads(Fernet(key).decrypt(encrypted).decode("utf-8"))
    except (InvalidToken, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: no se pudo descifrar .secrets.enc: {exc}")
        print("       Si reemplazaste .secret.key, usa --reset y vuelve a configurar.")
        sys.exit(1)


def save_secrets(payload):
    key = ensure_key()
    encrypted = Fernet(key).encrypt(json.dumps(payload).encode("utf-8"))
    with open(SECRETS_FILE, "wb") as f:
        f.write(encrypted)
    try:
        os.chmod(SECRETS_FILE, 0o600)
    except OSError:
        pass


def _apply_defaults(payload):
    for k, v in DEFAULTS.items():
        payload.setdefault(k, v)
    return payload


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _mask(value):
    if not value:
        return "(vacio)"
    if len(value) <= 6:
        return "*" * len(value)
    return f"{value[:3]}***{value[-3:]}"


def _prompt(label, secret=False, current=""):
    hint = ""
    if current:
        hint = f" [actual: {_mask(current) if secret else current}]"
    msg = f"  {label}{hint}: "
    if secret:
        return getpass.getpass(msg)
    return input(msg)


# ---------------------------------------------------------------------------
# Comandos
# ---------------------------------------------------------------------------
def cmd_init():
    ensure_key()
    if not os.path.exists(SECRETS_FILE):
        save_secrets(_apply_defaults({}))
    print(f"OK. Clave en      {SECRET_KEY_FILE}")
    print(f"OK. Secretos en   {SECRETS_FILE}")
    print()
    print("Ahora corre:")
    print("  python3 manage_secrets.py --set-cookies")
    print("  python3 manage_secrets.py --set-hubspot")
    return 0


def cmd_reset():
    confirm = input("Esto borrara .secrets.enc y .secret.key. Confirmas? (escribe SI): ")
    if confirm.strip().upper() != "SI":
        print("Cancelado.")
        return 1
    for f in (SECRETS_FILE, SECRET_KEY_FILE):
        if os.path.exists(f):
            os.remove(f)
            print(f"Eliminado: {f}")
    return 0


def cmd_status():
    payload = load_secrets()
    print("=" * 60)
    print("STATUS DE SECRETOS")
    print("=" * 60)
    print(f"Clave        : {SECRET_KEY_FILE}  -> {'OK' if os.path.exists(SECRET_KEY_FILE) else 'NO EXISTE'}")
    print(f"Cifrado      : {SECRETS_FILE}  -> {'OK' if os.path.exists(SECRETS_FILE) else 'NO EXISTE'}")
    print()
    print("Cookies DebtTrakker:")
    faltan = []
    for cookie in ALL_COOKIES:
        env_key = COOKIE_TO_ENV[cookie]
        value = payload.get(env_key, "")
        marca = " (requerida)" if cookie in REQUIRED_COOKIES else " (opcional)"
        estado = f"configurada ({_mask(value)})" if value else "NO configurada"
        print(f"  - {cookie:25s}{marca:13s}: {estado}")
        if cookie in REQUIRED_COOKIES and not value:
            faltan.append(cookie)
    if faltan:
        print(f"  >> Faltan cookies REQUERIDAS: {', '.join(faltan)}")
    else:
        print("  >> Todas las cookies requeridas estan configuradas.")
    print()
    print("HubSpot:")
    for name, required, secret in HUBSPOT_FIELDS:
        value = payload.get(name, "")
        marca = " (requerido)" if required else " (opcional)"
        if value:
            shown = _mask(value) if secret else value
            print(f"  - {name:25s}{marca:13s}: {shown}")
        else:
            print(f"  - {name:25s}{marca:13s}: NO configurado")
    print("=" * 60)
    # Tambien imprime el formato legacy para compatibilidad
    print()
    for env_key in list(COOKIE_TO_ENV.values()) + [f[0] for f in HUBSPOT_FIELDS]:
        print(f"{env_key}={'configurado' if payload.get(env_key) else 'vacio'}")
    return 0


def cmd_set_cookies_interactive():
    payload = _apply_defaults(load_secrets())
    print("Configura cookies de DebtTrakker. Deja vacio para no modificar.")
    print("(Las cookies sensibles se piden sin mostrar en pantalla)\n")
    changed = 0
    for cookie in ALL_COOKIES:
        env_key = COOKIE_TO_ENV[cookie]
        current = payload.get(env_key, "")
        # Tratar como secreto las cookies que parecen tokens/IDs largos
        is_secret = cookie in ("LCCurrentSessionID", "LCUID", "Leads_Manager")
        label = f"{cookie}{' (requerida)' if cookie in REQUIRED_COOKIES else ' (opcional)'}"
        value = _prompt(label, secret=is_secret, current=current)
        if value:
            payload[env_key] = value.strip()
            changed += 1
    if changed == 0:
        print("Nada que actualizar.")
        return 0
    save_secrets(payload)
    print(f"OK. {changed} valor(es) actualizado(s) y cifrado(s) en {SECRETS_FILE}")
    return 0


def cmd_set_hubspot_interactive():
    payload = _apply_defaults(load_secrets())
    print("Configura HubSpot. Deja vacio para no modificar.\n")
    changed = 0
    for name, required, secret in HUBSPOT_FIELDS:
        current = payload.get(name, "")
        label = f"{name}{' (requerido)' if required else ' (opcional)'}"
        value = _prompt(label, secret=secret, current=current)
        if value:
            payload[name] = value.strip()
            changed += 1
    if changed == 0:
        print("Nada que actualizar.")
        return 0
    save_secrets(payload)
    print(f"OK. {changed} valor(es) actualizado(s) y cifrado(s) en {SECRETS_FILE}")
    return 0


def cmd_set_cookie_single(pair):
    if "=" not in pair:
        print("Formato esperado: NOMBRE=valor   (p.ej. LCCurrentSessionID=abc...)")
        return 1
    name, _, value = pair.partition("=")
    name = name.strip()
    value = value.strip()
    if not name or not value:
        print("Nombre y valor son requeridos.")
        return 1
    if name not in COOKIE_TO_ENV:
        print(f"Aviso: '{name}' no es una cookie conocida. Se guarda igualmente.")
        env_key = f"ESIG_COOKIE_{name.upper()}"
    else:
        env_key = COOKIE_TO_ENV[name]
    payload = _apply_defaults(load_secrets())
    payload[env_key] = value
    save_secrets(payload)
    print(f"OK. Cookie '{name}' actualizada.")
    return 0


def cmd_legacy_set(args):
    """Compatibilidad con flags antiguos --session-id, --lcuid, etc."""
    payload = _apply_defaults(load_secrets())
    updates = {
        "ESIG_COOKIE_LCCURRENTSESSIONID": args.session_id,
        "ESIG_COOKIE_LCUID": args.lcuid,
        "ESIG_COOKIE_LEADS_MANAGER": args.leads_manager,
        "HUBSPOT_ACCESS_TOKEN": args.hubspot_token,
        "HUBSPOT_PIPELINE_STAGE": args.hubspot_stage,
        "HUBSPOT_PIPELINE": args.hubspot_pipeline,
    }
    changed = 0
    for k, v in updates.items():
        if v:
            payload[k] = v
            changed += 1
    if changed:
        save_secrets(payload)
        print(f"OK. {changed} valor(es) actualizado(s) y cifrado(s).")
    return cmd_status()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args():
    p = argparse.ArgumentParser(description="Gestor de secretos cifrados del scraper ESIG.")
    # Modos principales
    p.add_argument("--status", action="store_true", help="Muestra el estado sin revelar valores.")
    p.add_argument("--init", action="store_true", help="Crea archivos iniciales vacios.")
    p.add_argument("--reset", action="store_true", help="Borra .secrets.enc y .secret.key.")
    p.add_argument("--set-cookies", action="store_true", help="Configura cookies interactivamente.")
    p.add_argument("--set-hubspot", action="store_true", help="Configura HubSpot interactivamente.")
    p.add_argument("--set-cookie", metavar="NAME=VALUE", help="Actualiza una cookie individual.")
    p.add_argument("--interactive", action="store_true", help="Configura TODO interactivo (cookies + hubspot).")
    # Flags legacy (compatibilidad con la version anterior del README)
    p.add_argument("--session-id")
    p.add_argument("--lcuid")
    p.add_argument("--leads-manager")
    p.add_argument("--hubspot-token")
    p.add_argument("--hubspot-stage")
    p.add_argument("--hubspot-pipeline")
    return p.parse_args()


def main():
    args = parse_args()
    if args.status:
        return cmd_status()
    if args.init:
        return cmd_init()
    if args.reset:
        return cmd_reset()
    if args.set_cookies:
        return cmd_set_cookies_interactive()
    if args.set_hubspot:
        return cmd_set_hubspot_interactive()
    if args.set_cookie:
        return cmd_set_cookie_single(args.set_cookie)
    if args.interactive:
        cmd_set_cookies_interactive()
        cmd_set_hubspot_interactive()
        return 0
    # Flags legacy
    if any([args.session_id, args.lcuid, args.leads_manager,
            args.hubspot_token, args.hubspot_stage, args.hubspot_pipeline]):
        return cmd_legacy_set(args)
    # Sin argumentos: muestra ayuda + status
    print(__doc__.strip())
    print()
    return cmd_status()


if __name__ == "__main__":
    sys.exit(main())
