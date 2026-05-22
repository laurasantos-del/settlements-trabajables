#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
test_hubspot.py
----------------
Prueba el token y la configuracion de HubSpot creando 1 ticket y
borrandolo enseguida.

Uso:
    python3 test_hubspot.py            # crea y borra
    python3 test_hubspot.py --keep     # crea pero NO borra (para inspeccionar)
"""
import argparse
import sys

import requests

import manage_secrets as ms


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep", action="store_true",
                        help="No borrar el ticket despues de crearlo.")
    args = parser.parse_args()

    secrets = ms.load_secrets()
    token = secrets.get("HUBSPOT_ACCESS_TOKEN", "").strip()
    pipe = secrets.get("HUBSPOT_PIPELINE", "").strip()
    stage = secrets.get("HUBSPOT_PIPELINE_STAGE", "").strip()
    prio = secrets.get("HUBSPOT_TICKET_PRIORITY", "HIGH").strip()
    owner = secrets.get("HUBSPOT_OWNER_ID", "").strip()

    print(f"token presente : {bool(token)}  (len={len(token)})")
    print(f"pipeline       : {pipe}")
    print(f"stage          : {stage}")
    print(f"priority       : {prio}")
    print(f"owner_id       : {owner or '(no configurado)'}")
    print()

    if not (token and pipe and stage):
        print("ERROR: faltan campos requeridos en .secrets.enc")
        print("       Configurar con: python3 manage_secrets.py --set-hubspot")
        return 1

    properties = {
        "subject": "TEST ESIG Scraper - ignorar",
        "content": ("Ticket de prueba creado por test_hubspot.py para validar "
                    "token, pipeline y stage. Si no usaste --keep, se eliminara automaticamente."),
        "hs_pipeline": pipe,
        "hs_pipeline_stage": stage,
        "hs_ticket_priority": prio,
    }
    if owner:
        properties["hubspot_owner_id"] = owner

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    print(">> Creando ticket de prueba ...")
    r = requests.post(
        "https://api.hubapi.com/crm/v3/objects/tickets",
        headers=headers,
        json={"properties": properties},
        timeout=30,
    )
    print(f"   HTTP {r.status_code}")
    if r.status_code >= 400:
        print("   Respuesta:")
        print("   " + r.text[:2000].replace("\n", "\n   "))
        print()
        print("Pistas:")
        print("  - 401: token invalido o sin scope 'tickets'.")
        print("  - 403: token sin permiso para esta operacion.")
        print("  - 400: pipeline/stage no existen o no pertenecen al pipeline.")
        return 2

    data = r.json()
    tid = data.get("id")
    print(f"   Ticket creado OK. ID = {tid}")
    print(f"   URL: https://app.hubspot.com/contacts/_/ticket/{tid}")
    print()

    if args.keep:
        print("--keep activo: NO se elimina. Borrarlo manualmente o con:")
        print(f"   curl -X DELETE -H 'Authorization: Bearer <token>' \\")
        print(f"        https://api.hubapi.com/crm/v3/objects/tickets/{tid}")
        return 0

    print(">> Eliminando ticket de prueba ...")
    d = requests.delete(
        f"https://api.hubapi.com/crm/v3/objects/tickets/{tid}",
        headers=headers,
        timeout=30,
    )
    print(f"   HTTP {d.status_code}")
    if d.status_code in (200, 204):
        print("   Ticket eliminado OK. Todo el lado HubSpot funciona.")
        return 0

    print("   No se pudo eliminar. Respuesta:")
    print("   " + d.text[:1000].replace("\n", "\n   "))
    print(f"   Borralo manualmente en https://app.hubspot.com/contacts/_/ticket/{tid}")
    return 3


if __name__ == "__main__":
    sys.exit(main())
