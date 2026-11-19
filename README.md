# PV Formalność — wersja web (v2.0.0)

Statyczna wersja aplikacji **PV Formalność 2.0.0** — te same teksty, progi i
kolejność kroków co w wersji desktopowej (Python/customtkinter), uruchamiana
w całości w przeglądarce. Nie wymaga serwera, Pythona ani instalacji.

**Co zmieniło się w 2.0.0:** usunięto system licencji i kluczy, usunięto eksport
XLSX, dodano bramkę płatności **30 zł przez Przelewy24 przed pokazaniem wyniku**.
Jedna opłata odblokowuje wynik, podgląd A4 oraz jeden raport PDF 300 DPI —
bez drugiej płatności. Dodano też **webowy kalkulator inwestycji**: liczbę paneli
z powierzchni, koszty materiałów i robocizny oraz czas realizacji (wynik + PDF),
3 presety modułów **600 Wp** znanych marek, **dobór najtańszego wariantu**
(ranking po koszcie całkowitym, od zadanej mocy albo od powierzchni) oraz
**3 style raportu PDF** (Biały, Karty, Premium) wybierane w kroku Dane.
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
| Wycena (tylko web) | Liczba paneli z powierzchni, koszt modułów, konstrukcji/falownika, robocizny i czas realizacji; edytowalne parametry i 9 gotowych presetów modułów (także 600 Wp) |
| Dobór najtańszego wariantu (tylko web) | Ranking wszystkich modułów po koszcie całkowitym, start od mocy (kW) lub od powierzchni (ha), rekomendacja z uwzględnieniem dostępnego terenu i przycisk „Zastosuj najtańszy moduł" |
| Formularz | Miejsce montażu, obszar chroniony, powierzchnia, moc, punkt wyjścia optymalizatora oraz pola wyceny (model modułu, moc i pole panelu, pokrycie, ceny, tempo montażu) |
| Wynik | Decyzje TAK/NIE, ścieżka gov.pl, lista kroków w kolejności (z opcjonalnym „Działalność przedkoncesyjna"), sekcja wyceny, ranking optymalizatora, źródła i disclaimer |
| Podgląd A4 | Ten sam układ co w eksportowanym PDF, renderowany do canvasa 2480 × 3508 px |
| Płatność | Krok przed wynikiem: 30 zł przez Przelewy24, weryfikacja przez własny backend |
| Wynik i podgląd | Widoczne dopiero po potwierdzeniu opłaty; bezpośrednie wejście na `#/wynik` lub `#/podglad` przekierowuje do płatności |
| Eksport PDF | PDF 1.4, A4, **300 DPI**, JPEG `/DCTDecode`, polskie znaki (fonty DejaVu), bez drukarki i bez okna wydruku — wliczony w tę samą opłatę; zawiera sekcję wyceny i tabelę rankingu; **3 wybierane style** |
| Styl raportu | Biały (czyste tło, cienkie linie), Karty (sekcje w ramkach z zielonym akcentem), Premium (ciemnogranatowy nagłówek, kolorowe pola decyzji — dotychczasowy wygląd) |

Dane formularza i konfiguracja płatności są zapisywane w `localStorage`.
Obliczenia i PDF powstają lokalnie. Jedynym zewnętrznym krokiem jest płatność
 w Przelewy24 i — po skonfigurowaniu — wywołanie endpointów własnego backendu.

**XLSX i licencja nie istnieją w wersji 2.0.0.**

---

## Kalkulator paneli, kosztów i czasu (tylko web)

W trybie wyceny liczba paneli wynika z **powierzchni**, nie z mocy:

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
| Jinko Tiger Neo 600W · N-type TOPCon bifacial | 600 Wp | ~470 zł (orientacyjnie, 0,78 zł/Wp) |
| Longi Hi-MO 7 600W · HPBC | 600 Wp | ~490 zł (orientacyjnie, 0,82 zł/Wp) |
| Canadian Solar HiKu7 600W · Mono PERC | 600 Wp | ~455 zł (orientacyjnie, 0,76 zł/Wp) |

Ceny modułów 600 Wp **nie zostały potwierdzone konkretną ofertą sklepu** —
są wyliczone z tego samego poziomu 0,76–0,82 zł/Wp co powyższe zestawienie
bursatm.pl i wyraźnie oznaczone jako orientacyjne w `COST_SOURCE_LINE`.
Powierzchnia modułu 600 Wp przyjęta jako **2,70 m²** (typowy format ok.
2384 × 1134 mm). Przed finalną wyceną sprawdź aktualną ofertę wybranego
modułu i wpisz cenę ręcznie w polach edytowalnych.

Robocizna: **1000–1500 zł/kWp brutto** oraz **2000–5000 zł dla instalacji
5 kWp** (e-greenpower.pl, 11.07.2026). W modelu przyjęto 300 zł/panel oraz
250 zł/panel na konstrukcję, falownik i osprzęt; domyślne tempo to 12 paneli
dziennie. Ustawienia domyślne i pełne źródła są w `js/model.js`
(`ESTIMATE_DEFAULT`, `COST_SOURCE_LINE`). Kwoty są orientacyjne.

Wyniki trafiają do widoku **Wynik** oraz do sekcji „Wycena i czas realizacji"
w PDF i podglądzie A4. Obliczenie porównuje też moc z paneli z mocą
deklarowaną w formularzu i ostrzega przy rozbieżności > 10%.

---

## Dobór najtańszego wariantu (tylko web)

Optymalizator (`M.optimize()` w `js/model.js`) porównuje **wszystkie 9 presetów**
po koszcie całkowitym:

```
koszt całkowity = liczba paneli × (cena modułu + konstrukcja/falownik + robocizna)
```

Punkt wyjścia wybiera się w kroku **Dane**:

- **Mam zaplanowaną moc (kW)** — liczba paneli to
  `ceil(moc [kW] × 1000 / moc modułu [Wp])`; sprawdzane jest też, czy moduły
  mieszczą się na podanej powierzchni przy zadanym pokryciu. Rekomendacja to
  najtańszy wariant, który jednocześnie osiąga moc i mieści się na terenie.
- **Mam powierzchnię (ha)** — liczba paneli to
  `floor(ha × 10 000 × pokrycie / pole modułu)`, czyli maksymalne wykorzystanie
  dostępnego terenu. Rekomendacja to najtańszy wariant z rankingu.

Wynik (widok **Wynik**, sekcja PDF i podgląd A4) zawiera:

- rekomendację (moduł, liczba sztuk, moc, koszt całkowity, czas realizacji),
- różnicę kosztu względem najtańszego wariantu,
- pełną tabelę rankingu (moduł, panele, moc, powierzchnia, razem),
- przycisk **„Zastosuj najtańszy moduł"**, który wpisuje wskazany preset do
  wyceny i przelicza wynik.

Jeśli żaden moduł nie mieści się na podanej powierzchni, aplikacja pokazuje
odpowiednią uwagę zamiast błędnej rekomendacji. Tryb i wynik optymalizatora
są zapisywane w `localStorage` razem z projektem. Ranking jest generowany
dopiero po opłacie — tak samo jak wynik i PDF.

---

## Trzy style raportu PDF

W kroku **Dane** znajduje się pole **„Styl raportu"** (zapis w `localStorage`).
Wygląd dotyczy zarówno podglądu A4, jak i pobranego pliku PDF — treść, kolejność
sekcji i wymiary strony są identyczne:

| Styl | Opis |
| --- | --- |
| **Biały — prosty i czytelny** | Białe tło bez kolorowego paska, cienkie linie pod tytułami sekcji, pola decyzji i kroki tylko w obrysie. Najlepszy do druku i do dalszej edycji. |
| **Karty — sekcje w ramkach** | Białe tło, zielony pasek nagłówka, dane wejściowe, decyzje, kroki, wycena i ranking w jasnych kartach z zielonym akcentem (motyw zielono-złoty webu). |
| **Premium — ciemnogranatowo-złoty** | Dotychczasowy wygląd: ciemnogranatowy pasek, wypełnione pola TAK/NIE, niebieskie numerki kroków. Domyślny styl. |

Style są zdefiniowane jako palety w `js/pdf.js` (`PVPdf.themes`, `PALETTES`).
Wszystkie strony mają jawnie wypełnione białe tło, więc styl „Biały" nie zależy
od ustawień przeglądarki ani programu do PDF.

---

## Struktura

```
pv-formalnosc-web/
├── index.html          # powłoka aplikacji
├── app.css             # motyw zielono-złoty, layout, responsywność
├── favicon.svg
├── js/
│   ├── model.js        # kalkulator — port 1:1 z model.py + estimate() + optimize()
│   ├── payment.js      # bramka Przelewy24 (szkielet, bez tajnych danych)
│   ├── pdf.js          # PDF 1.4 300 DPI + podgląd A4 (wycena, ranking, 3 style)
│   └── app.js          # UI, routing, płatność, optymalizator, eksport PDF
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
- 3 presety 600 Wp (marka, moc, pole 2,70 m², cena orientacyjna, opis źródła),
- optymalizator: rosnący ranking 9 modułów, wybór dla mocy i dla powierzchni,
  zaokrąglenie w górę przy mocy, rekomendacja omijająca moduły, które się nie
  mieszczą, uwagi o zerowym pokryciu i zbyt małej powierzchni,
- strukturę PDF (nagłówek 1.4, `/DCTDecode`, 2480 × 3508, poprawny `xref`, `%%EOF`,
  sekcję wyceny i ranking optymalizatora bez błędu renderu),
- wszystkie 3 style PDF i podglądu A4 (poprawny plik, jedna strona, różne pliki
  wyjściowe — czyli style naprawdę się różnią),
- wymiary podglądu A4 i pola formularza (w tym punkt wyjścia optymalizatora
  i wybór stylu raportu).

Wynik: `TOTAL 86 PASS / 0 FAIL` (kod wyjścia 0).

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
