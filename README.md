# PV Formalność — wersja web (v2.0.0)

Statyczna wersja aplikacji **PV Formalność 2.0.0** — te same teksty, progi i
kolejność kroków co w wersji desktopowej (Python/customtkinter), uruchamiana
w całości w przeglądarce. Nie wymaga serwera, Pythona ani instalacji.

**Co zmieniło się w 2.0.0:** usunięto system licencji i kluczy, usunięto eksport
XLSX, dodano bramkę płatności **30 zł za jeden raport PDF przez Przelewy24**
przed wygenerowaniem pliku.

Motyw wizualny (zielono-złoty, górny pasek, nawigacja kroków, karty) jest
wzorowany na projekcie **PAB cyfrowa** tego samego autora:
`..\opis PZT i PAB\sites`.

Odpowiednik desktopowy: `PV_Formalność_v2.0.0.exe` (16,3 MB).
Stary fallback C# `PV_Formalność_v1.2.0.exe` pozostaje niezmieniony.

---

## Co działa

| Funkcja | Opis |
| --- | --- |
| Kalkulator | Pełny port `pv_formalnosc/model.py` — 10 ścieżek, progi 2 ha / 0,5 ha / 150 kW / 1 MW, komunikaty i uwaga o braku opisu przypadku na gov.pl |
| Formularz | Miejsce montażu, obszar chroniony, powierzchnia, moc; wynik aktualizuje się od razu |
| Wynik | Decyzje TAK/NIE, ścieżka gov.pl, lista kroków w kolejności (z opcjonalnym „Działalność przedkoncesyjna”), źródła i disclaimer |
| Podgląd A4 | Ten sam układ co w eksportowanym PDF, renderowany do canvasa 2480 × 3508 px |
| Płatność | Ostatni krok przed PDF: 30 zł przez Przelewy24, weryfikacja przez własny backend |
| Eksport PDF | PDF 1.4, A4, **300 DPI**, JPEG `/DCTDecode`, polskie znaki (fonty DejaVu), bez drukarki i bez okna wydruku — dopiero po opłacie |

Dane formularza i konfiguracja płatności są zapisywane w `localStorage`.
Obliczenia i PDF powstają lokalnie. Jedynym zewnętrznym krokiem jest płatność
 w Przelewy24 i — po skonfigurowaniu — wywołanie endpointów własnego backendu.

**XLSX i licencja nie istnieją w wersji 2.0.0.**

---

## Struktura

```
pv-formalnosc-web/
├── index.html          # powłoka aplikacji
├── app.css             # motyw zielono-złoty, layout, responsywność
├── favicon.svg
├── js/
│   ├── model.js        # kalkulator — port 1:1 z model.py
│   ├── payment.js      # bramka Przelewy24 (szkielet, bez tajnych danych)
│   ├── pdf.js          # PDF 1.4 300 DPI + podgląd A4
│   └── app.js          # UI, routing, płatność, eksport PDF
├── assets/
│   ├── DejaVuSans.ttf
│   └── DejaVuSans-Bold.ttf
├── tools/
│   ├── selftest.html   # testy w przeglądarce
│   ├── selftest.py     # uruchamia testy headless Chrome/Edge
│   └── screenshots.py  # zrzuty wszystkich widoków do _screenshots/
└── .github/workflows/deploy.yml
```

---

## Uruchomienie lokalne

Nie wystarczy otworzyć `index.html` przez `file://` — przeglądarka może zablokować
fonty i `fetch`. Użyj dowolnego serwera statycznego:

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

- wersję 2.0.0 i brak modułów licencji / XLSX,
- bramkę: 30 zł / 3000 groszy, sesję 32-hex, adres Przelewy24, opłatę i jej zużycie,
- 11 przypadków kalkulatora porównanych z wynikami desktopowego `model.py`,
- strukturę PDF (nagłówek 1.4, `/DCTDecode`, 2480 × 3508, poprawny `xref`, `%%EOF`),
- wymiary podglądu A4.

Wynik: `TOTAL 33 PASS / 0 FAIL` (kod wyjścia 0).

---

## Bramka płatności — konfiguracja (ważne)

Statyczna strona **nie może** bezpiecznie przechowywać `merchantId`, `posId`,
`crc` ani klucza API. Dlatego w kodzie znajdują się tylko dwa placeholdery
endpointów własnego backendu:

| Endpoint | Żądanie | Odpowiedź |
| --- | --- | --- |
| `createUrl` | `POST {sessionId, amount: 3000, currency: "PLN", description, sandbox}` | `{"url": "https://...przelewy24.pl/tranzakcja/TOKEN"}` |
| `verifyUrl` | `POST {sessionId, amount: 3000}` | `{"paid": true}` |

Backend (np. Cloudflare Worker, Vercel Function albo mały serwer) powinien:

1. zawołać `POST https://sandbox-api.przelewy24.pl/api/v1/transaction/register`
   (lub `https://api.przelewy24.pl/...` na produkcji) z danymi merchantu,
2. zwrócić token jako adres przekierowania,
3. po powrocie użytkownika zawołać `/api/v1/transaction/verify` z CRC
   i zwrócić `{"paid": true}` tylko dla opłaconej sesji o kwocie 3000 groszy.

Endpointy wpisuje właściciel w widoku **Płatność → Konfiguracja bramki**
(zapis w `localStorage`). Dopóki są puste, aplikacja działa w **trybie testowym**:
po kliknięciu „Potwierdź i pobierz PDF" plik powstaje bez pobierania opłaty.
To jedyny tryb możliwy na czystym GitHub Pages bez backendu.

Jedna sesja = jeden PDF. Po pobraniu pliku opłata jest zużywana.

---

## Publikacja na GitHub Pages

Repozytorium: `https://github.com/raminassar-arch/pv-formalnosc` (gałąź `main`).

1. W repozytorium: `Settings → Pages → Build and deployment` ustaw
   **Source: GitHub Actions**.
2. Workflow `.github/workflows/deploy.yml` najpierw uruchomi testy
   (`python tools/selftest.py`), potem opublikuje stronę.
3. Push na `main` publikuje nową wersję automatycznie.
4. Adres: `https://raminassar-arch.github.io/pv-formalnosc/`.

Plik `.nojekyll` zapobiega przetwarzaniu katalogu przez Jekyll.

Jeśli chcesz osadzić aplikację w Google Sites, otwórz `embed.html` — przygotuje
gotowy kod iframe z adresem opublikowanej strony.

---

## Parność z desktopem

Silnik kalkulatora, teksty decyzji, kolejność kroków, formatowanie liczb
(polski przecinek), źródła i disclaimer są identyczne jak w `model.py`.
PDF używa tego samego układu A4 w jednostkach projektowych 150 DPI skalowanych
×2 do 300 DPI (2480 × 3508 px) oraz tego samego zapisu PDF 1.4 z obrazem JPEG.

Różnice wynikające ze środowiska:

- rasteryzację robi Canvas zamiast PIL (jakość JPEG porównywalna),
- weryfikacja płatności odbywa się przez `fetch` do backendu zamiast
  `urllib.request` w desktopie.
