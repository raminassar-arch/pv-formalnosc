r"""Generuje js/keys.js — WYŁĄCZNIE hasha SHA-256 kluczy.

Plaintext kluczy nigdy nie trafia do katalogu webowego. Uruchom:

    python tools/gen_keys.py "C:\...\pv-formalnosc-python\keys"
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / "js" / "keys.js"


def hashes(path: Path) -> list[str]:
    if not path.is_file():
        raise SystemExit(f"Brak pliku: {path}")
    values = []
    for line in path.read_text(encoding="utf-8").splitlines():
        key = "".join(ch for ch in line.strip().upper() if ch.isalnum())
        if len(key) == 20:
            values.append(hashlib.sha256(key.encode("utf-8")).hexdigest())
    return sorted(set(values))


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Podaj katalog z kluczami (keys).")
    keys_dir = Path(sys.argv[1])
    life = hashes(keys_dir / "klucze_licencyjne_1000.txt")
    year = hashes(keys_dir / "klucze_licencyjne_1rok_1000.txt")

    payload = json.dumps(
        {"version": 1, "lifetime": life, "year": year,
         "countLifetime": len(life), "countYear": len(year)},
        ensure_ascii=False, separators=(",", ":"),
    )
    OUT.write_text(
        "/* Wygenerowane przez tools/gen_keys.py — wyłącznie hashe SHA-256. "
        "Nie edytuj ręcznie. */\n"
        '(function (root) { "use strict";\n'
        "  root.PVKeys = " + payload + ";\n"
        '})(typeof window !== "undefined" ? window : globalThis);\n',
        encoding="utf-8",
    )
    print(f"{OUT.name}: lifetime={len(life)}, year={len(year)}, "
          f"bytes={OUT.stat().st_size}")


if __name__ == "__main__":
    main()
