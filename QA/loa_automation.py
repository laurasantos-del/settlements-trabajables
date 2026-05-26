#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

"""
LOA automation runner.

Phase 1 runs in dry-run mode by default:
  - resolves active creditors from a DebtManager-like payload
  - applies the hard stop before any document operation
  - resolves delivery route from a creditor directory
  - generates the final filename
  - writes an auditable plan JSON

No email, fax, LetterStream job, document download, or HubSpot close is performed
unless a future explicit live mode is added.
"""

import argparse
import csv
import json
import os
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any


DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUTPUT = os.path.join(DIR, "loa_dry_run_results.json")

BLOCKED_TOKENS = {"chase", "jpmorgan", "american express", "discover"}

CREDITOR_ALIASES = {
    "disc/fnbsd": "discover",
    "disc fnbsd": "discover",
    "disc bank": "discover",
    "fnbsd": "discover",
    "jpm": "jpmorgan",
    "jp morgan": "jpmorgan",
    "jpmc": "jpmorgan",
    "amex": "american express",
    "ae centurion": "american express",
}

PROGRAM_DOCUMENT_RULES = {
    "debt settlement": {"document": "LOA", "enrollment_page": 8},
    "dfusa-n": {"document": "LOA", "enrollment_page": 8},
    "df-cfln": {"document": "POA", "enrollment_page": 5},
}


@dataclass
class Client:
    client_id: str
    first_name: str
    last_name: str
    program_type: str


@dataclass
class Creditor:
    creditor_id: str
    raw_name: str
    status: str = "active"
    email: str = ""
    fax: str = ""
    postal_zip: str = ""


@dataclass
class ActionPlan:
    event: str
    client_id: str
    ticket_hs: str
    creditor_id: str
    creditor_raw: str
    matched_token: str | None
    route: str
    filename: str | None
    document_action: str
    delivery_action: str
    dm_action: str
    hubspot_action: str
    timestamp: str
    warnings: list[str]


def normalize_creditor_name(raw: str) -> str:
    value = (raw or "").lower().strip()
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value


def resolve_canonical(normalized: str) -> str:
    for alias, canonical in CREDITOR_ALIASES.items():
        if alias in normalized:
            return canonical
    return normalized


def blocked_match(raw: str) -> str | None:
    normalized = normalize_creditor_name(raw)
    canonical = resolve_canonical(normalized)
    return next((token for token in BLOCKED_TOKENS if token in canonical), None)


def slug_file_part(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9]+", "-", value or "")
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "UNKNOWN"


def today_file_date() -> str:
    return datetime.now().strftime("%Y.%m.%d")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_creditor_directory(path: str | None) -> dict[str, dict[str, str]]:
    if not path:
        return {}

    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    directory = {}
    for row in rows:
        name = row.get("creditor_name") or row.get("name") or row.get("creditor") or ""
        if not name:
            continue
        directory[normalize_creditor_name(name)] = {k: (v or "").strip() for k, v in row.items()}
    return directory


def directory_lookup(raw_name: str, directory: dict[str, dict[str, str]]) -> dict[str, str]:
    if not directory:
        return {}

    normalized = normalize_creditor_name(raw_name)
    canonical = resolve_canonical(normalized)

    for key, row in directory.items():
        if key == normalized or key == canonical:
            return row
        if key in normalized or normalized in key:
            return row
    return {}


def parse_client(payload: dict[str, Any]) -> Client:
    client = payload.get("client", payload)
    return Client(
        client_id=str(client.get("client_id") or client.get("id") or client.get("DM_ClientID") or ""),
        first_name=str(client.get("first_name") or client.get("firstName") or ""),
        last_name=str(client.get("last_name") or client.get("lastName") or ""),
        program_type=str(client.get("program_type") or client.get("programType") or ""),
    )


def parse_creditors(payload: dict[str, Any]) -> list[Creditor]:
    raw_creditors = payload.get("creditors") or payload.get("active_creditors") or payload.get("debts") or []
    creditors = []
    for item in raw_creditors:
        status = str(item.get("status") or item.get("debt_status") or "active")
        if status and "inactive" in status.lower():
            continue
        creditors.append(
            Creditor(
                creditor_id=str(item.get("creditor_id") or item.get("id") or ""),
                raw_name=str(item.get("creditor_name") or item.get("name") or item.get("creditor") or ""),
                status=status,
                email=str(item.get("email") or ""),
                fax=str(item.get("fax") or item.get("fax_number") or ""),
                postal_zip=str(item.get("postal_zip") or item.get("zip") or ""),
            )
        )
    return creditors


def resolve_route(creditor: Creditor, directory_row: dict[str, str]) -> tuple[str, list[str]]:
    warnings = []
    send_method = (directory_row.get("send_method") or "").strip().lower()
    letterstream_flag = (directory_row.get("letterstream_flag") or "").strip().lower()
    email = creditor.email or directory_row.get("email", "")
    fax = creditor.fax or directory_row.get("fax_number", "") or directory_row.get("fax", "")
    postal_address = directory_row.get("postal_address", "")

    if send_method in {"letterstream", "postal", "mail"} or letterstream_flag in {"true", "1", "yes", "y"}:
        if not postal_address:
            warnings.append("postal route selected but postal_address is missing")
        return "postal_review", warnings
    if send_method == "none":
        return "manual_exception", warnings
    if email:
        return "email", warnings
    if fax:
        return "fax", warnings
    if postal_address:
        return "postal_review", warnings

    warnings.append("no delivery channel found")
    return "manual_exception", warnings


def document_rule(program_type: str) -> dict[str, Any]:
    normalized = normalize_creditor_name(program_type)
    return PROGRAM_DOCUMENT_RULES.get(normalized, {"document": "LOA", "enrollment_page": 8})


def build_filename(client: Client, creditor_name: str, doc_type: str) -> str:
    client_name = " ".join(part for part in [client.first_name, client.last_name] if part).strip()
    return (
        f"{doc_type}-{slug_file_part(client.client_id)}-"
        f"{slug_file_part(client_name)}-{slug_file_part(creditor_name)}-"
        f"{today_file_date()}.pdf"
    )


def build_plan(payload: dict[str, Any], ticket_hs: str, directory: dict[str, dict[str, str]]) -> list[ActionPlan]:
    client = parse_client(payload)
    creditors = parse_creditors(payload)
    rule = document_rule(client.program_type)
    plans = []

    for creditor in creditors:
        timestamp = utc_now()
        matched = blocked_match(creditor.raw_name)
        if matched:
            plans.append(
                ActionPlan(
                    event="LOA_BLOCKED",
                    client_id=client.client_id,
                    ticket_hs=ticket_hs,
                    creditor_id=creditor.creditor_id,
                    creditor_raw=creditor.raw_name,
                    matched_token=matched,
                    route="blocked",
                    filename=None,
                    document_action="SKIP: hard stop before download/generation",
                    delivery_action="SKIP: no send attempted",
                    dm_action="DRY_RUN: would add LOA_BLOCKED note to DM",
                    hubspot_action="DRY_RUN: would tag/update ticket LOA_BLOCKED",
                    timestamp=timestamp,
                    warnings=[],
                )
            )
            continue

        directory_row = directory_lookup(creditor.raw_name, directory)
        route, warnings = resolve_route(creditor, directory_row)
        filename = build_filename(client, creditor.raw_name, rule["document"])
        document_action = (
            f"DRY_RUN: would fetch direct {rule['document']} attachment; "
            f"fallback enrollment page {rule['enrollment_page']}"
        )
        if route == "postal_review":
            delivery_action = "DRY_RUN: would enqueue postal payload; LetterStream job not created"
            event = "LOA_POSTAL_QUEUED_DRY_RUN"
        elif route in {"email", "fax"}:
            delivery_action = f"DRY_RUN: would send via {route}"
            event = "LOA_SEND_READY_DRY_RUN"
        else:
            delivery_action = "DRY_RUN: would create manual exception"
            event = "LOA_ERROR_DRY_RUN"

        plans.append(
            ActionPlan(
                event=event,
                client_id=client.client_id,
                ticket_hs=ticket_hs,
                creditor_id=creditor.creditor_id,
                creditor_raw=creditor.raw_name,
                matched_token=None,
                route=route,
                filename=filename,
                document_action=document_action,
                delivery_action=delivery_action,
                dm_action="DRY_RUN: would write action note to DM",
                hubspot_action="DRY_RUN: would update ticket after all creditors resolve",
                timestamp=timestamp,
                warnings=warnings,
            )
        )

    return plans


def write_results(path: str, plans: list[ActionPlan]) -> None:
    payload = {
        "mode": "dry_run",
        "generated_at": utc_now(),
        "summary": {
            "total": len(plans),
            "blocked": sum(1 for p in plans if p.event == "LOA_BLOCKED"),
            "email": sum(1 for p in plans if p.route == "email"),
            "fax": sum(1 for p in plans if p.route == "fax"),
            "postal_review": sum(1 for p in plans if p.route == "postal_review"),
            "manual_exception": sum(1 for p in plans if p.route == "manual_exception"),
        },
        "plans": [asdict(plan) for plan in plans],
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def print_summary(plans: list[ActionPlan], output_path: str) -> None:
    print("LOA automation dry run")
    print("=" * 60)
    for plan in plans:
        print(f"{plan.event:24s} | {plan.creditor_raw:32s} | {plan.route}")
        if plan.filename:
            print(f"  file: {plan.filename}")
        if plan.matched_token:
            print(f"  matched_token: {plan.matched_token}")
        for warning in plan.warnings:
            print(f"  warning: {warning}")
    print("=" * 60)
    print(f"Resultado guardado: {output_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Automatizacion LOA - Fase 1 dry run.")
    parser.add_argument("--input-file", required=True, help="JSON con cliente y acreedores activos de DM.")
    parser.add_argument("--ticket-id", default="", help="ID del ticket de HubSpot asociado.")
    parser.add_argument("--creditor-directory", help="CSV del directorio de acreedores.")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Archivo JSON de salida.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    payload = load_json(args.input_file)
    directory = load_creditor_directory(args.creditor_directory)
    plans = build_plan(payload, args.ticket_id, directory)
    write_results(args.output, plans)
    print_summary(plans, args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
