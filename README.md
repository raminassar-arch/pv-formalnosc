# PV Formalność — wersja web (v2.0.0)

Statyczna wersja aplikacji **PV Formalność 2.0.0** — te same teksty, progi i
kolejność kroków co w wersji desktopowej (Python/customtkinter), uruchamiana
w całości w przeglądarce. Nie wymaga serwera, Pythona ani instalacji.

**Co zmieniło się w 2.0.0:** usunięto system licencji i kluczy, usunięto eksport
XLSX, dodano bramkę płatności **30 zł przez Przelewy24 przed pokazaniem wyniku**.
Jedna opłata odblokowuje wynik, podgląd A4 oraz jeden raport PDF 300 DPI —
bez drugiej płatności. Dodano też **webowy kalkulator inwestycji**: liczbę paneli
z powierzchni, koszty materiałów i robocizny oraz czas realizacji (wynik + PDF).
Wersja desktopowa i plik `PV_Formalność_v2.0.0.exe` pozostają niezmienione.

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
| Wycena (tylko web) | Liczba paneli z powierzchni, koszt modułów, konstrukcji/falownika, robocizny i czas realizacji; edytowalne parametry i gotowe presety modułów |
| Formularz | Miejsce montażu, obszar chroniony, powierzchnia, moc oraz pola wyceny (model modułu, moc i pole panelu, pokrycie, ceny, tempo montażu) |
| Wynik | Decyzje TAK/NIE, ścieżka gov.pl, lista kroków w kolejności (z opcjonalnym „Działalność przedkoncesyjna”), sekcja wyceny, źródła i disclaimer |
| Podgląd A4 | Ten sam układ co w eksportowanym PDF, renderowany do canvasa 2480 × 3508 px |
| Płatność | Krok przed wynikiem: 30 zł przez Przelewy24, weryfikacja przez własny backend |
| Wynik i podgląd | Widoczne dopiero po potwierdzeniu opłaty; bezpośrednie wejście na `#/wynik` lub `#/podglad` przekierowuje do płatności |
| Eksport PDF | PDF 1.4, A4, **300 DPI**, JPEG `/DCTDecode`, polskie znaki (fonty DejaVu), bez drukarki i bez okna wydruku — wliczony w tę samą opłatę; zawiera też sekcję wyceny |

Dane formularza i konfiguracja płatności są zapisywane w `localStorage`.
Obliczenia i PDF powstają lokalnie. Jedynym zewnętrznym krokiem jest płatność
 w Przelewy24 i — po skonfigurowaniu — wywołanie endpointów własnego backendu.

**XLSX i licencja nie istnieją w wersji 2.0.0.**

---

## Kalkulator paneli, kosztów i czasu (tylko web)

Liczba paneli wynika z **powierzchni**, nie z mocy:

```
powierzchnia użyteczna [m²] = ha × 10 000 × pokrycie [%] / 100
liczba paneli          = floor(powierzchnia użyteczna / pole modułu [m²])
moc z paneli [kW]       = liczba paneli × moc modułu [Wp] / 1000
koszt materiałów        = liczba paneli × (cena modułu + konstrukcja/falownik/osprzęt)
koszt wykonania         = liczba paneli × robocizna na panel
czas realizacji [dni]   = ceil(liczba paneli / tempo montażu [panel/dzień])
```

Wszystkie parametry są edytowalne w kroku **Dane**. Lista rozwijana zawiera
gotowe presety modułów z orientacyjnymi cenami brutto z polskiego rynku:

| Moduł | Moc | Cena brutto/szt. (bursatm.pl, 31.07.2026) |
| --- | --- | --- |
| Jinko Tiger Neo 440W · N-type TOPCon | 440 Wp | 320–381 zł (przyjęto 350 zł) |
| Longi Hi-MO 5m 445W · Mono PERC | 445 Wp | 295–338 zł (przyjęto 317 zł) |
| Trina Vertex S+ 445W · TOPCon | 445 Wp | 301–351 zł (przyjęto 326 zł) |
| Trina Vertex S 450W · TOPCon bifacial | 450 Wp | 350–415 zł (przyjęto 383 zł) |
| Suntech Ultra V 450W · Mono PERC | 450 Wp | 283–332 zł (przyjęto 308 zł) |
| Selfa S450MH · Mono PERC (PL) | 450 Wp | 264–314 zł (przyjęto 289 zł) |

Robocizna: **1000–1500 zł/kWp brutto** oraz **2000–5000 zł dla instalacji
5 kWp** (e-greenpower.pl, 11.07.2026). W modelu przyjęto 300 zł/panel oraz
250 zł/panel na konstrukcję, falownik i osprzęt; domyślne tempo to 12 paneli
dziennie. Ustawienia domyślne i pełne źródła są w `js/model.js`
(`ESTIMATE_DEFAULT`, `COST_SOURCE_LINE`). Kwoty są orientacyjne.

Wyniki trafiają do widoku **Wynik** oraz do sekcji „Wycena i czas realizacji"
w PDF i podglądzie A4. Obliczenie porównuje też moc z paneli z mocą
deklarowaną w formularzu i ostrzega przy rozbieżności > 10%.

---

## Struktura

```
pv-formalnosc-web/
├── index.html          # powłoka aplikacji
├── app.css             # motyw zielono-złoty, layout, responsywność
├── favicon.svg
├── js/
│   ├── model.js        # kalkulator — port 1:1 z model.py + estimate() (wycena)
│   ├── payment.js      # bramka Przelewy24 (szkielet, bez tajnych danych)
│   ├── pdf.js          # PDF 1.4 300 DPI + podgląd A4 (również sekcja wyceny)
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
- blokadę wyniku i podglądu przed opłatą, przejście do wyniku po opłacie,
- 11 przypadków kalkulatora porównanych z wynikami desktopowego `model.py`,
- matematykę wyceny (panele z ha i pokrycia, materiały, robocizna, razem, dni,
  zaokrąglenia, formatowanie zł, zgodność mocy) i obecność sekcji w widoku wyniku,
- strukturę PDF (nagłówek 1.4, `/DCTDecode`, 2480 × 3508, poprawny `xref`, `%%EOF`,
  sekcję wyceny bez błędu renderu),
- wymiary podglądu A4 i pola formularza wyceny.

Wynik: `TOTAL 61 PASS / 0 FAIL` (kod wyjścia 0).

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
po kliknięciu „Potwierdź i zobacz wynik" wynik otwiera się bez pobierania opłaty.
To jedyny tryb możliwy na czystym GitHub Pages bez backendu.

Jedna sesja = wynik + podgląd + jeden PDF. Opłata jest zużywana dopiero po
pomyślnym pobraniu pliku; pobranie PDF nie wymaga drugiej płatności.

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
