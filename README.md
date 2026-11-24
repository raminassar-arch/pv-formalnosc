# Formalność OZE — wersja web (v2.0.0)

Statyczna wersja aplikacji **Formalność OZE 2.0.0** — te same teksty, progi i
kolejność kroków co w wersji desktopowej (Python/customtkinter), uruchamiana
w całości w przeglądarce. Nie wymaga serwera, Pythona ani instalacji.

**Co zmieniło się w 2.0.0:** usunięto system licencji i kluczy, usunięto eksport
XLSX, dodano szkielet bramki płatności **30 zł przez Przelewy24** do włączenia
w wersji produkcyjnej. **Obecna publiczna wersja testowa jest odblokowana**:
wynik, podgląd A4 oraz jeden raport PDF 300 DPI są dostępne bez opłaty. Dodano osobne zakładki **Fotowoltaika**, **Wiatr**, **Woda**, **Geotermia** i **Biomasa** z kalkulatorami orientacyjnymi oraz checklistami KPK gov.pl; PV pozostaje osobnym modułem głównym. Dodano
też **webowy kalkulator inwestycji**: liczbę paneli dobraną automatycznie z mocy
i powierzchni, koszty materiałów i robocizny oraz czas realizacji (wynik + PDF),
3 presety modułów **600 Wp** znanych marek, **dobór najtańszego wariantu**
(ranking po koszcie całkowitym z uwzględnieniem oba wejścia) oraz **3 style
raportu PDF** (Motyw 1, Motyw 2, Motyw 3) wybierane w panelu „Podgląd i PDF”
każdej zakładki. Na zakładce **Start** znajduje się siatka 3 kolumn
ikon-kafli (panel ze słońcem, turbina, woda, geotermia, biomasa, porównanie)
— sama ikona jest przyciskiem otwierającym zakładkę.
W formularzu **Dane** edytowalne są: miejsce montażu, lokalizacja, moc i powierzchnia.
Powierzchnię można wpisać w hektarach (ha) albo metrach kwadratowych (m²)
(1 ha = 10 000 m²), a moc w kilowatach (kW) albo watach (W) (1 kW = 1000 W).
Pozostałe parametry wyceny są stałe i widoczne w raporcie. Wynik, podgląd A4 i PDF
znajdują się na dole każdej zakładki; zakładki Płatność, Wynik, Podgląd i O programie
są ukryte.
Wersja desktopowa i plik `PV_Formalność_v2.0.0.exe` pozostają niezmienione.

> **BUDOWA TESTOWA — wersja publiczna odblokowana.** W `js/payment.js`
> `TEST_MODE = true`: wynik, podgląd A4 i PDF są dostępne **bez
> opłaty**. Z widoku **Płatność** usunięto sekcje „Konfiguracja bramki (dla
> właściciela)" oraz „Jak to działa"; konfiguracja została tylko jako API
> `PVPayment.saveConfig()`. Każda strona raportu PDF i podglądu A4 ma
> przekątny znak wodny **WERSJA TESTOWA** — tak samo jak oznaczenie w widoku
> „O programie". Powrót do bramki 30 zł: `TEST_MODE = false` i własny backend.

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
| Wycena (tylko web) | Liczba paneli z obu wejść (moc i powierzchnia), koszt modułów, konstrukcji/falownika, robocizny i czas realizacji; stałe parametry i 9 gotowych presetów modułów (także 600 Wp) |
| Dobór najtańszego wariantu (tylko web) | Ranking wszystkich modułów po koszcie całkowitym, liczba paneli = minimum zapotrzebowania na moc i maksimum z powierzchni; rekomendacja i uwaga, gdy powierzchnia ogranicza moc |
| Formularz | Edytowalne: miejsce montażu, lokalizacja, moc w kW lub W (1 kW = 1000 W) oraz powierzchnia w ha lub m² (1 ha = 10 000 m²); pozostałe parametry wyceny pokazywane w raporcie |
| Wynik | Decyzje TAK/NIE, ścieżka gov.pl, lista kroków w kolejności (z opcjonalnym „Działalność przedkoncesyjna"), sekcja wyceny, ranking optymalizatora, wybór stylu PDF, źródła i disclaimer |
| Podgląd A4 | Ten sam układ co w eksportowanym PDF, renderowany do canvasa 2480 × 3508 px |
| Płatność | Wersja testowa: dostęp bez opłaty i bez danych bramki. W kodzie pozostaje szkielet bramki 30 zł (Przelewy24, `createUrl`/`verifyUrl`) bez edytowalnego panelu konfiguracji |
| Wynik i podgląd | W wersji testowej zakładki są odblokowane, a bezpośrednie `#/wynik` / `#/podglad` działają bez opłaty. Po `TEST_MODE = false` wraca blokada kłódką i przekierowanie na płatność bez zapisu w historii |
| Eksport PDF | PDF 1.4, A4, **300 DPI**, JPEG `/DCTDecode`, polskie znaki (fonty DejaVu), bez drukarki i bez okna wydruku - w wersji testowej bez opłaty; zawiera sekcję wyceny, tabelę rankingu i stałe parametry; **3 wybierane style** |
| Styl raportu | **Motyw 1** — biały, ostre kąty; **Motyw 2** — karty z zaokrągleniami; **Motyw 3** — premium z większym promieniem i złotymi akcentami. Wybór w panelu „Podgląd i PDF" każdej zakładki, w tym Porównaj |
| Znak wodny | Dwie linie — „BIM ARCHITECTS & CONSULTANTS" i „WERSJA TESTOWA" — na każdej stronie PDF i w podglądzie A4 (przezroczysty, przekątny, pod treścią); znika automatycznie po `TEST_MODE = false` |

Dane formularza i stan sesji są zapisywane w `localStorage`. Obliczenia
i PDF powstają lokalnie. W wersji testowej nie ma żadnego zewnętrznego kroku;
po `TEST_MODE = false` są nim płatność w Przelewy24 i wywołanie endpointów
własnego backendu.

**XLSX i licencja nie istnieją w wersji 2.0.0.**

---

## Kalkulator paneli, kosztów i czasu (tylko web)

Liczba paneli jest dobierana automatycznie z **mocy i powierzchni** — użytkownik
podaje tylko jedno i drugie w kroku Dane:

```
panele z mocy      = ceil(moc [kW] × 1000 / moc modułu [Wp])
panele z powierzchni = floor(ha × 10 000 × pokrycie [%] / 100 / pole modułu [m²])
liczba paneli      = minimum(panele z mocy, panele z powierzchni)
moc z paneli [kW]  = liczba paneli × moc modułu [Wp] / 1000
koszt materiałów   = liczba paneli × (cena modułu + konstrukcja/falownik/osprzęt)
koszt wykonania    = liczba paneli × robocizna na panel
czas realizacji    = ceil(liczba paneli / tempo montażu [panel/dzień])
```

Jeśli powierzchnia jest za mała, aby osiągnąć zadaną moc, raport pokazuje
maksymalną liczbę modułów mieszczących się na terenie i wyraźną uwagę
„Powierzchnia ogranicza moc".

Pozostałe parametry są **stałe** (nieedytowalne w formularzu) i zostają
umieszczone w raporcie PDF w sekcji „Dane wejściowe": wybrany moduł, jego moc
i pole, pokrycie, cena modułu, BOS i robocizna. Domyślnie przyjęto moduł
Canadian Solar 600 Wp (455 zł, 2,70 m²), pokrycie 80%, 250 zł/panel BOS,
300 zł/panel robocizny i tempo 12 paneli dziennie. Pełne źródła i lista
9 presetów są w `js/model.js` (`ESTIMATE_DEFAULT`, `COST_SOURCE_LINE`,
`MODULE_PRESETS`).

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
2384 × 1134 mm). Robocizna: **1000–1500 zł/kWp brutto** oraz **2000–5000 zł
dla instalacji 5 kWp** (e-greenpower.pl, 11.07.2026). Kwoty są orientacyjne.

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

Nie ma już pola wyboru trybu — aplikacja zawsze liczy z obu podanych wartości:

- liczba paneli z mocy: `ceil(moc [kW] × 1000 / moc modułu [Wp])`,
- liczba paneli z powierzchni:
  `floor(ha × 10 000 × pokrycie / pole modułu)`,
- ostatecznie `min(z mocy, z powierzchni)`.

Rekomendacja to najtańszy wariant spełniający oba warunki. Gdy powierzchnia
nie pozwala osiągnąć zadanej mocy, raport pokazuje ostrzeżenie i maksymalny
wariant mieszczący się na terenie. Wynik (widok **Wynik**, sekcja PDF
i podgląd A4) zawiera:

- rekomendację (moduł, liczba sztuk, moc, koszt całkowity, czas realizacji),
- liczbę paneli „z mocy" i „z powierzchni" dla każdego wariantu,
- różnicę kosztu względem najtańszego wariantu,
- pełną tabelę rankingu (moduł, panele, moc, powierzchnia, razem).

Parametry modułów pozostają stałe — nie ma już przycisku zmiany presetu
w wyniku. Wybór modułu jest częścią rekomendacji i trafia do raportu.

Tryb doboru jest stały (`both`) i zapisywany w `localStorage` razem
z projektem. Ranking jest generowany razem z wynikiem i PDF (w wersji testowej —
od razu, bez opłaty).

---

## Inne OZE — osobne zakładki

Każde źródło OZE ma osobną zakładkę (**Fotowoltaika**, **Wiatr**, **Woda**,
**Geotermia**, **Biomasa**) z kalkulatorem, checklistą, podglądem i PDF.

- **PV** — pełny moduł pozostaje w zakładce **Fotowoltaika** (bez duplikowania).
- **Wiatr/Woda/Geotermia/Biomasa** — kalkulatory orientacyjne z edytowalnymi założeniami.
- **Ścieżki formalne** — nazwy kroków z wydruków Krajowego Punktu Kontaktowego ds. OZE
  (gov.pl/web/kontaktoze, stan na 24.11.2026); zakres procedury zależy od lokalizacji,
  skali projektu i aktualnych przepisów.
- **Źródła**: gov.pl (opis OZE, 26.07.2022), KPK gov.pl (wydruki procesów inwestycyjnych)
  oraz BGK Przewodnik analizy wykonalności OZE (09.2024).

Wyniki kalkulatorów OZE są orientacyjne i nie stanowią porady prawnej/projektowej.

Zakładka **Porównaj warianty OZE** zestawia energię, CAPEX, OPEX, przychód,
bilans roczny i prosty okres zwrotu. Zwrot jest zawsze prezentowany z dokładnością
do dwóch miejsc po przecinku (np. `3,14 lat`) — w tabeli, w podsumowaniu
i w generowanym PDF.

---

## Trzy style raportu PDF

W panelu **„Podgląd i PDF"** każdej zakładki (Fotowoltaika, Wiatr, Woda,
Geotermia, Biomasa, Porównaj) znajduje się pole **„Styl raportu"** (zapis w `localStorage`).
Wygląd dotyczy zarówno podglądu A4, jak i pobranego pliku PDF — treść, kolejność
sekcji i wymiary strony są identyczne:

| Opcja w selectcie | Opis |
| --- | --- |
| **Motyw 1** | Białe tło bez kolorowego paska, ostre prostokąty (promień 0), cienkie linie pod tytułami sekcji, kwadratowe numerki kroków i pola decyzji tylko w obrysie. Najlepszy do druku i do dalszej edycji. |
| **Motyw 2** | Białe tło, zielony pasek nagłówka, dane wejściowe, decyzje, kroki, wycena i ranking w jasnych kartach z zaokrąglonymi narożnikami (promień 16) i okrągłymi numerkami. |
| **Motyw 3** | Ciemnogranatowy pasek, złota zaokrąglona etykieta podtytułu, największy promień narożników (26), zaokrąglone numerki i wypełnione pola TAK/NIE. Domyślny styl. |

Style mają różny „charakter” kształtów: kwadraty i prostokąty z ostrymi kątami,
karty z zaokrągleniami oraz premium z większym promieniem. Zdefiniowano je jako
palety i kształty w `js/pdf.js` (`PVPdf.themes`, `PALETTES`, `SHAPES`).
Wszystkie strony mają jawnie wypełnione białe tło, więc Motyw 1 nie zależy
od ustawień przeglądarki ani programu do PDF.

Interlinia jest zawsze większa od wysokości czcionki, a wysokość kart, ramek
ostrzeżeń i pól decyzji jest liczona z faktycznej liczby zawiniętych wierszy.
Dzięki temu napisy się nie nakładają. Gdy treść OZE lub porównania nie mieści
się na jednej stronie, raport automatycznie przechodzi na kolejną stronę A4
(z powtórzonym nagłówkiem, stopką i numerem strony). Podgląd A4 pokazuje
pierwszą stronę tego samego układu, który trafia do PDF.

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
- wersję testową: brak panelu konfiguracji i sekcji „Jak to działa" na Płatności,
  odblokowane zakładki, wynik bez opłaty i znak wodny WERSJA TESTOWA,
- 11 przypadków kalkulatora porównanych z wynikami desktopowego `model.py`,
- matematykę wyceny (panele z mocy i powierzchni, materiały, robocizna, razem,
  dni, zaokrąglenia, formatowanie zł, zgodność mocy) i obecność sekcji w widoku wyniku,
- 3 presety 600 Wp (marka, moc, pole 2,70 m², cena orientacyjna, opis źródła),
- optymalizator: rosnący ranking 9 modułów, dobór z obu wejść, minimum mocy
  i powierzchni, uwaga gdy powierzchnia ogranicza moc, rekomendacja omijająca
  moduły, które się nie mieszczą, uwagi o zerowym pokryciu i zbyt małej powierzchni,
- strukturę PDF (nagłówek 1.4, `/DCTDecode`, 2480 × 3508, poprawny `xref`, `%%EOF`,
  sekcję wyceny i ranking optymalizatora bez błędu renderu),
- wszystkie 3 style PDF i podglądu A4 (poprawny plik, jedna strona, różne pliki
  wyjściowe — czyli style naprawdę się różnią),
- wymiary podglądu A4 oraz formularz z miejscem montażu, lokalizacją, mocą i powierzchnią,
- wybór stylu raportu w widoku Wynik/Podgląd.

Wynik: `TOTAL 216 PASS / 0 FAIL` (kod wyjścia 0).

---

## Bramka płatności — konfiguracja (ważne)

Statyczna strona **nie może** bezpiecznie przechowywać `merchantId`, `posId`,
`crc` ani klucza API. Dlatego w kodzie znajdują się tylko dwa placeholdery
endpointów własnego backendu:

| Endpoint | Żądanie | Odpowiedź |
| --- | --- | --- |
| `createUrl` | `POST {sessionId, amount: 3000, currency: "PLN", description, sandbox}` | `{"url": "https://...przelewy24.pl/tranzakcja/TOKEN"}` |
| `verifyUrl` | `POST {sessionId, amount: 3000}` | `{"paid": true}` |

Panel „Konfiguracja bramki (dla właściciela)" został usunięty z interfejsu —
endpointy ustawia się przez API `PVPayment.saveConfig({createUrl, verifyUrl,
sandbox})` (zapis w `localStorage`) albo w kodzie. Dane merchantu zostają
wyłącznie po stronie backendu (np. Cloudflare Worker, Vercel Function).

Backend powinien zarejestrować transakcję w Przelewy24, zwrócić token jako
adres przekierowania i — po powrocie użytkownika — zwrócić `{"paid": true}`
tylko dla opłaconej sesji o kwocie 3000 groszy.

**Obecnie wersja testowa:** `TEST_MODE = true` w `js/payment.js` — przycisk
na stronie Płatności otwiera wynik bez weryfikacji, a PDF ma znak wodny.
Po ustawieniu `TEST_MODE = false` wynik pozostaje zablokowany, dopóki backend
nie potwierdzi płatności. W obu trybach jedna sesja = wynik + podgląd + jeden
PDF; opłata jest zużywana dopiero po pomyślnym pobraniu pliku (w wersji
testowej dostęp jest odnawiany automatycznie).

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
