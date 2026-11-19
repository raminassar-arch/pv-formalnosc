"""Kaputuje zrzuty ekranu wszystkich widoków wersji web (Chrome headless).

Użycie:
    python tools/screenshots.py [katalog_wyjsciowy]

Domyślnie zapisuje do folderu ``_screenshots`` w katalogu projektu.
Widoki ``wynik`` i ``podglad`` są za bramką płatności — przed zrzutem
ustawiana jest opłacona sesja testowa (tylko w profilu przeglądarki zrzutu).
"""

from __future__ import annotations

import http.server
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "_screenshots"
ROUTES = ["start", "dane", "platnosc", "wynik", "podglad", "o-programie"]
GATED = {"wynik", "podglad"}
SEED = ROOT / "_gate_seed.html"
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

SEED_HTML = """<!doctype html><html lang="pl"><head><meta charset="utf-8"></head><body>
<script src="js/payment.js"></script>
<script>
(function () {
  var r = new URLSearchParams(location.search).get("route") || "wynik";
  PVPayment.clearConfig();
  PVPayment.reset();
  PVPayment.confirmTest(PVPayment.newSession());
  location.replace("index.html#/" + r);
})();
</script>
</body></html>
"""


def find_browser() -> str:
    for path in CHROME_CANDIDATES:
        if Path(path).is_file():
            return path
    for name in ("google-chrome", "google-chrome-stable", "chromium-browser",
                 "chromium", "chrome", "msedge"):
        found = shutil.which(name)
        if found:
            return found
    raise SystemExit("Nie znaleziono Chrome/Edge — nie można zrobić zrzutów.")


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        pass


def main() -> None:
    os.chdir(ROOT)
    OUT.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()

    SEED.write_text(SEED_HTML, encoding="utf-8")
    browser = find_browser()
    try:
        for i, route in enumerate(ROUTES):
            profile = OUT / f"prof-{route}"
            shot = OUT / f"{i + 1:02d}-{route}.png"
            if route in GATED:
                url = f"http://127.0.0.1:{port}/_gate_seed.html?route={route}"
            else:
                url = f"http://127.0.0.1:{port}/index.html#/{route}"
            cmd = [
                browser,
                "--headless=new", "--disable-gpu", "--hide-scrollbars",
                "--no-first-run", "--no-sandbox", "--no-default-browser-check",
                "--disable-background-networking",
                f"--user-data-dir={profile}",
                "--window-size=1280,1800",
                "--virtual-time-budget=8000",
                f"--screenshot={shot}",
                url,
            ]
            subprocess.run(cmd, capture_output=True, timeout=60)
            status = "OK" if shot.is_file() else "BRAK"
            print(f"{status:4}  {shot.name}")
    finally:
        SEED.unlink(missing_ok=True)
        server.shutdown()


if __name__ == "__main__":
    main()
