"""Uruchamia testy wersji web w prawdziwej przeglądarce (Chrome/Edge headless).

Użycie:
    python tools/selftest.py

Skrypt:
  1. uruchamia tymczasowy serwer HTTP z katalogu web,
  2. otwiera tools/selftest.html w headless Chrome,
  3. odczytuje wyniki z DOM i kończy kodem 0 (wszystko PASS) lub 1.
"""

from __future__ import annotations

import html
import http.server
import os
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def find_browser() -> str:
    for path in CHROME_CANDIDATES:
        if Path(path).is_file():
            return path
    for name in ("google-chrome", "google-chrome-stable", "chromium-browser",
                 "chromium", "chrome", "msedge"):
        found = shutil.which(name)
        if found:
            return found
    raise SystemExit("Nie znaleziono Chrome/Edge — nie można uruchomić testów web.")


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        pass


def main() -> int:
    os.chdir(ROOT)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    profile = Path(os.environ.get("TEMP", ".")) / "pv-formalnosc-web-selftest"
    cmd = [
        find_browser(),
        "--headless=new", "--disable-gpu", "--no-first-run", "--no-sandbox",
        "--disable-background-networking", "--no-default-browser-check",
        f"--user-data-dir={profile}",
        "--virtual-time-budget=15000",
        "--dump-dom",
        f"http://127.0.0.1:{port}/tools/selftest.html",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    finally:
        server.shutdown()

    dom = proc.stdout
    match = re.search(r"<pre id=\"out\">(.*?)</pre>", dom, re.S)
    if not match:
        print("Nie udało się odczytać wyników testów.")
        print(proc.stdout[-2000:])
        print(proc.stderr[-2000:])
        return 1

    report = html.unescape(match.group(1)).replace("&amp;", "&")
    print(report)

    fail = re.search(r"TOTAL\s+(\d+)\s+PASS\s+/\s+(\d+)\s+FAIL", report)
    if not fail:
        print("Brak podsumowania testów.")
        return 1
    return 1 if int(fail.group(2)) else 0


if __name__ == "__main__":
    sys.exit(main())
