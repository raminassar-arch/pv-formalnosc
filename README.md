# PV Formalność — wersja web (v1.3.0)

Statyczna wersja aplikacji **PV Formalność 1.3.0** — te same teksty, progi i
kolejność kroków co w wersji desktopowej (Python/customtkinter), uruchamiana
w całości w przeglądarce. Nie wymaga serwera, Pythona ani instalacji.

Motyw wizualny (zielono-złoty, górny pasek, nawigacja kroków, karty) jest
wzorowany na projekcie **PAB cyfrowa** tego samego autora:
`..\opis PZT i PAB\sites`.

Wersja desktopowa `PV_Formalność_v1.3.0.exe` oraz fallback
`PV_Formalność_v1.2.0.exe` pozostają niezmienione.

---

## Co działa

| Funkcja | Opis |
| --- | --- |
| Kalkulator | Pełny port `pv_formalnosc/model.py` — 10 ścieżek, progi 2 ha / 0,5 ha / 150 kW / 1 MW, komunikaty i uwaga o braku opisu przypadku na gov.pl |
| Formularz | Miejsce montażu, obszar chroniony, powierzchnia, moc; wynik aktualizuje się od razu |
| Wynik | Decyzje TAK/NIE, ścieżka gov.pl, lista kroków w kolejności (z opcjonalnym „Działalność przedkoncesyjna”), źródła i disclaimer |
| Podgląd A4 | Ten sam układ co w eksportowanym PDF, renderowany do canvasa 2480 × 3508 px |
| Eksport PDF | PDF 1.4, A4, **300 DPI**, JPEG `/DCTDecode`, polskie znaki (fonty DejaVu), bez drukarki i bez okna wydruku |
| Eksport XLSX | Czysty ZIP + XML (bez openpyxl), arkusz „Wynik” z danymi, decyzjami i krokami |
| Licencja | 14 dni próbki, 1000 kluczy dożywotnich + 1000 rocznych (365 dni od aktywacji), wyłącznie hashe SHA-256 |

Dane formularza i stan licencji są zapisywane w `localStorage`. **Nic nie jest
wysyłane na serwer.** Jedynymi zasobami są pliki tej strony oraz lokalne fonty
DejaVu.

---

## Struktura

```
pv-formalnosc-web/
├── index.html          # powłoka aplikacji
├── app.css             # motyw zielono-złoty, layout, responsywność
├── favicon.svg
├── js/
│   ├── model.js        # kalkulator — port 1:1 z model.py
│   ├── keys.js         # WYŁĄCZNIE hashe SHA-256 (generowane)
│   ├── license.js      # próbka i klucze (localStorage)
│   ├── zip.js          # minimalny zapis ZIP (store)
│   ├── xlsx.js         # eksport XLSX
│   ├── pdf.js          # PDF 1.4 300 DPI + podgląd A4
│   └── app.js          # UI, routing, eksport, aktywacja klucza
├── assets/
│   ├── DejaVuSans.ttf
│   └── DejaVuSans-Bold.ttf
├── tools/
│   ├── gen_keys.py     # generuje js/keys.js z folderu keys/
│   ├── selftest.html   # testy w przeglądarce
│   ├── selftest.py     # uruchamia testy headless Chrome/Edge
│   └── screenshots.py  # zrzuty wszystkich widoków do _screenshots/
└── .github/workflows/deploy.yml
```

---

## Uruchomienie lokalne

Nie wystarczy otworzyć `index.html` przez `file://` — przeglądarka może zablokować
fonty i Web Crypto. Użyj dowolnego serwera statycznego:

```bat
cd pv-formalnosc-web
python -m http.server 8765
```

Potem otwórz <http://127.0.0.1:8765/>.

---

## Testy

```bat
python tools/selftest.py
```

Testy uruchamiane są w prawdziwej przeglądarce (headless Chrome lub Edge) i
sprawdzają m.in.:

- 11 przypadków kalkulatora porównanych z wynikami desktopowego `model.py`,
- 1000 + 1000 hashów kluczy (64 znaki hex), odrzucenie złego klucza,
- strukturę PDF (nagłówek 1.4, `/DCTDecode`, 2480 × 3508, poprawny `xref`, `%%EOF`),
- strukturę XLSX (ZIP, `workbook.xml`, `worksheets/sheet1.xml`),
- wymiary podglądu A4.

Wynik: `TOTAL 27 PASS / 0 FAIL` (kod wyjścia 0).

---

## Publikacja na GitHub Pages

Repozytorium: `https://github.com/raminassar-arch/pv-formalnosc` (gałąź `main`).

1. Utwórz puste repozytorium `pv-formalnosc` na koncie `raminassar-arch`
   (bez README/licencji — żeby uniknąć konfliktu przy pierwszym pushu).
2. W repozytorium: `Settings → Pages → Build and deployment` ustaw
   **Source: GitHub Actions**.
3. Katalog `pv-formalnosc-web` jest już lokalnym repozytorium Git z gałęzią
   `main`, commit `7a2d7d6` i remote `origin`. Pozostaje tylko wypchnięcie:

   ```bat
   cd pv-formalnosc-web
   git push -u origin main
   ```

   (przy pierwszym pushu GitHub poprosi o logowanie / token — użyj
   *Personal Access Token* z uprawnieniem `repo` jako hasła).

4. Workflow `.github/workflows/deploy.yml` najpierw uruchomi testy
   (`python tools/selftest.py`), potem opublikuje stronę.
5. Adres: `https://raminassar-arch.github.io/pv-formalnosc/`.

Plik `.nojekyll` zapobiega przetwarzaniu katalogu przez Jekyll.

Jeśli chcesz osadzić aplikację w Google Sites, otwórz `embed.html` — przygotuje
gotowy kod iframe z adresem opublikowanej strony
(`https://raminassar-arch.github.io/pv-formalnosc/`).

---

## Klucze — ważne

- Katalog web **nie zawiera jawnych kluczy**. `js/keys.js` ma wyłącznie hashe
  SHA-256 (134 KB) wygenerowane z `..\pv-formalnosc-python\keys`.
- Aby odtworzyć plik po zmianie kluczy:

  ```bat
  python tools/gen_keys.py "..\pv-formalnosc-python\keys"
  ```

- Klucz aktywowany w wersji desktopowej działa też w web (te same hashe), ale
  **stan licencji nie jest współdzielony**: desktop zapisuje go w `%LOCALAPPDATA%`
  i rejestrze Windows, web w `localStorage`. Trzeba aktywować klucz osobno.
- Ochrona w statycznej stronie jest „na uczciwego użytkownika" — stan w
  `localStorage` da się wyczyścić z poziomu devtools. Realna ochrona wymagałaby
  serverless (np. Cloudflare Worker), co nie jest już czysty GitHub Pages.

---

## Parność z desktopem

Silnik kalkulatora, teksty decyzji, kolejność kroków, formatowanie liczb
(polski przecinek), źródła i disclaimer są identyczne jak w `model.py`.
PDF używa tego samego układu A4 w jednostkach projektowych 150 DPI skalowanych
×2 do 300 DPI (2480 × 3508 px) oraz tego samego zapisu PDF 1.4 z obrazem JPEG.

Różnice wynikające ze środowiska:

- rasteryzację robi Canvas zamiast PIL (jakość JPEG porównywalna),
- XLSX jest składany w JS zamiast w Pythonie (ten sam układ arkusza),
- licencja web nie zapisuje stanu w systemie Windows.
