from __future__ import annotations

import re


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


def normalize_creditor_name(raw: str) -> str:
    v = raw.lower().strip()
    v = re.sub(r"[^a-z0-9\s]", " ", v)
    v = re.sub(r"\s+", " ", v).strip()
    return v


def resolve_canonical(normalized: str) -> str:
    for alias, canonical in CREDITOR_ALIASES.items():
        if alias in normalized:
            return canonical
    return normalized


def blocked_match(raw: str) -> str | None:
    """Retorna el token bloqueado si el acreedor esta en la lista,
    None si es seguro proceder."""
    normalized = normalize_creditor_name(raw)
    canonical = resolve_canonical(normalized)
    return next((t for t in BLOCKED_TOKENS if t in canonical), None)
