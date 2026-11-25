/* ==========================================================================
   PV Formalność — wersja web
   model.js — kalkulator ścieżki formalnej. Port 1:1 z pv_formalnosc/model.py.
   ========================================================================== */
(function (root) {
  "use strict";

  const VERSION = "2.0.0";
  const CHRON = 0.5, INNY = 2, POW = 150, MICRO = 50, PPOZ = 6.5, BIG = 1000;
  const OPTIONAL_STEPS = [8];

  const PLACE_GROUND = "Grunt / konstrukcja wolnostojąca";
  const PLACE_ROOF = "Dach / elewacja budynku";
  const LOC_NORMAL = "Pozostały obszar";
  const LOC_PROTECTED = "Obszar chroniony lub otulina";

  const STEPS = [
    ["Decyzja o środowiskowych uwarunkowaniach",
     "Pierwszy etap ścieżki dla instalacji naziemnych powyżej progu. Powierzchnię liczy się po obrysie zewnętrznych skrajnych modułów."],
    ["Procedury planistyczne",
     "Plan miejscowy (MPZP) albo, na terenach bez planu, decyzja o warunkach zabudowy (okres przejściowy po reformie planowania, Dz.U. 2023 poz. 1688). Możliwy też Zintegrowany Plan Inwestycyjny (ZPI)."],
    ["Uzgodnienie projektu z rzeczoznawcą ppoż.",
     "Projekt urządzeń fotowoltaicznych uzgadnia się z rzeczoznawcą ds. zabezpieczeń przeciwpożarowych."],
    ["Zgłoszenie mikroinstalacji lub warunki przyłączenia",
     "Jeśli moc mikroinstalacji nie przekracza mocy przyłączeniowej obiektu, wystarczy zgłoszenie, a operator przyłącza w ciągu 30 dni. W przeciwnym razie trzeba złożyć wniosek o warunki przyłączenia."],
    ["Warunki przyłączenia do sieci",
     "Dokument operatora sieci z danymi technicznymi i zobowiązaniem do zawarcia umowy przyłączeniowej. Jeśli umowa nie zostanie zawarta w ciągu 12 miesięcy, warunki tracą moc."],
    ["Pozwolenie na budowę",
     "Podstawa do rozpoczęcia prac budowlanych. Bez tej decyzji nie wolno zacząć budowy ani eksploatacji."],
    ["Zawiadomienie Straży Pożarnej o zakończeniu budowy",
     "Dotyczy instalacji powyżej 6,5 kW. Jeśli straż nie zajmie stanowiska w ciągu 14 dni od zawiadomienia, uznaje się to za brak sprzeciwu lub uwag."],
    ["Zawiadomienie nadzoru budowlanego o zakończeniu budowy",
     "Elektrownie fotowoltaiczne nie wymagają pozwolenia na użytkowanie. Można zacząć użytkowanie, jeśli w ciągu 14 dni od doręczenia zawiadomienia nadzór nie zgłosi sprzeciwu decyzją."],
    ["Działalność przedkoncesyjna",
     "Od dnia pierwszego wprowadzenia energii do sieci można prowadzić działalność przed uzyskaniem koncesji. To nie zwalnia z obowiązku koncesji."],
    ["Koncesja na wytwarzanie energii z OZE",
     "Wymagana dla instalacji, które nie korzystają ze zwolnienia z obowiązku koncesyjnego (w tych ścieżkach: instalacje powyżej 1 MW)."],
    ["Wpis do rejestru małych instalacji OZE",
     "Zastępuje koncesję dla instalacji o łącznej mocy powyżej 50 kW i nie większej niż 1 MW."],
  ];

  // numer ścieżki -> [nazwa, zakres, indeksy kroków]
  const PATHS = {
    1: ["Mikroinstalacja do 6,5 kW", "do 6,5 kW", [3]],
    2: ["Mikroinstalacja powyżej 6,5 kW", "powyżej 6,5 do 50 kW", [2, 3, 6]],
    3: ["Mała nadachowa do 150 kW", "powyżej 50 do 150 kW, dach", [4, 2, 6, 10]],
    4: ["Mała nadachowa powyżej 150 kW", "powyżej 150 kW do 1 MW, dach", [4, 5, 7, 10]],
    5: ["Mała naziemna do 150 kW", "powyżej 50 do 150 kW, grunt", [1, 4, 2, 6, 10]],
    6: ["Mała naziemna powyżej 150 kW, poniżej progu powierzchni",
        "powyżej 150 kW do 1 MW, grunt", [1, 4, 5, 7, 10]],
    7: ["Mała naziemna powyżej 150 kW, powyżej progu powierzchni",
        "powyżej 150 kW do 1 MW, grunt", [0, 1, 4, 5, 7, 10]],
    8: ["Wielkoskalowa nadachowa", "powyżej 1 MW, dach", [4, 5, 7, 8, 9]],
    9: ["Wielkoskalowa naziemna, poniżej progu powierzchni",
        "powyżej 1 MW, grunt", [1, 4, 5, 7, 8, 9]],
    10: ["Wielkoskalowa naziemna, powyżej progu powierzchni",
         "powyżej 1 MW, grunt", [0, 1, 4, 5, 7, 8, 9]],
  };

  const SOURCE_LINE =
    "Źródło: Krajowy Punkt Kontaktowy ds. OZE (gov.pl/web/kontaktoze), " +
    "rozporządzenie RM z 10.09.2019 r. (zm. 2023), art. 29 ust. 4 pkt 3 " +
    "lit. c Prawa budowlanego; stan na 17.11.2026.";
  const DISCLAIMER =
    "Wynik ma charakter informacyjny i nie jest poradą prawną. Potwierdź w urzędzie gminy.";
  const AUTHOR_LINE =
    "Autor: Rami Nassar, BIM architects & consultants, " +
    "raminassar.arch@gmail.com · 2026 · wersja " + VERSION;
  const THRESHOLDS_LINE =
    "Progi: decyzja środowiskowa od 2 ha (0,5 ha na terenach " +
    "chronionych), pozwolenie na budowę powyżej 150 kW.";

  /** Odpowiednik Calculator.Fmt / model.fmt — polski separator dziesiętny. */
  function fmt(n) {
    let s = Number(n || 0).toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
    return s.replace(".", ",");
  }

  /** Prosty okres zwrotu — zawsze dwa miejsca po przecinku. */
  function fmtPayback(years) {
    if (years == null || !isFinite(Number(years))) return "brak zwrotu";
    return Number(years).toFixed(2).replace(".", ",") + " lat";
  }

  function todayPl() {
    const d = new Date();
    const p = (v) => (v < 10 ? "0" : "") + v;
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  }

  // --- liczba paneli, koszty i czas realizacji (tylko wersja web) -----------

  /** Ceny brutto za sztukę to środki przedziałów z zestawienia bursatm.pl
   *  (aktualizacja 31.07.2026); powierzchnie to wymiary modułu w m².
   *  Presety 600 Wp to orientacyjne 0,76–0,82 zł/Wp wyliczone z tego samego
   *  poziomu cenowego (szczegóły w COST_SOURCE_LINE). */
  const MODULE_PRESETS = [
    { id: "jinko440",    name: "Jinko Tiger Neo 440W · N-type TOPCon",
      short: "Jinko 440W", wp: 440, area: 1.95, price: 350 },
    { id: "longi445",    name: "Longi Hi-MO 5m 445W · Mono PERC",
      short: "Longi 445W", wp: 445, area: 1.85, price: 317 },
    { id: "trina445",    name: "Trina Vertex S+ 445W · TOPCon",
      short: "Trina 445W+", wp: 445, area: 1.87, price: 326 },
    { id: "trina450",    name: "Trina Vertex S 450W · TOPCon bifacial",
      short: "Trina 450W", wp: 450, area: 1.92, price: 383 },
    { id: "suntech450",  name: "Suntech Ultra V 450W · Mono PERC",
      short: "Suntech 450W", wp: 450, area: 1.94, price: 308 },
    { id: "selfa450",    name: "Selfa S450MH · Mono PERC (polska produkcja)",
      short: "Selfa 450W (PL)", wp: 450, area: 1.94, price: 289 },
    { id: "jinko600",    name: "Jinko Tiger Neo 600W · N-type TOPCon bifacial",
      short: "Jinko 600W", wp: 600, area: 2.70, price: 470 },
    { id: "longi600",    name: "Longi Hi-MO 7 600W · HPBC",
      short: "Longi 600W", wp: 600, area: 2.70, price: 490 },
    { id: "canadian600", name: "Canadian Solar HiKu7 600W · Mono PERC",
      short: "Canadian 600W", wp: 600, area: 2.70, price: 455 },
  ];

  const ESTIMATE_DEFAULT = {
    preset: "jinko440",
    panelWp: 440,
    panelAreaM2: 1.95,
    coveragePct: 80,
    modulePriceZl: 350,
    bosPerPanelZl: 250,
    laborPerPanelZl: 300,
    panelsPerDay: 12,
  };

  const COST_SOURCE_LINE =
    "Ceny modułów brutto/szt. i powierzchnie: bursatm.pl, zestawienie " +
    "hurtowo-detaliczne (aktualizacja 31.07.2026) — Jinko Tiger Neo 440W " +
    "320–381 zł, Longi Hi-MO 5m 445W 295–338 zł, Trina Vertex S+ 445W " +
    "301–351 zł, Trina Vertex S 450W 350–415 zł. Moduły 600 Wp (Jinko, Longi, " +
    "Canadian Solar): orientacyjnie 455–490 zł/szt. (0,76–0,82 zł/Wp) — cena " +
    "wyliczona z ww. poziomu zł/Wp, nie z oferty konkretnego sklepu. Robocizna: " +
    "e-greenpower.pl (11.07.2026) — 1000–1500 zł/kWp brutto, 2000–5000 zł dla " +
    "instalacji 5 kWp. Kwoty orientacyjne; przed finalną wyceną sprawdź aktualne oferty.";
  const COST_BREAKDOWN_LINE =
    "Cena całkowita (Razem) obejmuje moduły, konstrukcję/falownik/osprzęt (BOS) " +
    "oraz robociznę. Kwoty są brutto i orientacyjne.";

  function numOr(value, fallback) {
    const n = Number(value);
    return isFinite(n) && n >= 0 ? n : fallback;
  }

  function presetById(id) {
    for (let i = 0; i < MODULE_PRESETS.length; i++) {
      if (MODULE_PRESETS[i].id === id) return MODULE_PRESETS[i];
    }
    return null;
  }

  /** Bezpieczne scalenie zapisanych ustawień z domyślnymi. */
  function estimateOptions(data) {
    const s = data || {};
    const preset = presetById(s.preset) || presetById(ESTIMATE_DEFAULT.preset);
    return {
      preset: preset.id,
      panelWp: numOr(s.panelWp, preset.wp),
      panelAreaM2: numOr(s.panelAreaM2, preset.area),
      coveragePct: Math.min(100, numOr(s.coveragePct, ESTIMATE_DEFAULT.coveragePct)),
      modulePriceZl: numOr(s.modulePriceZl, preset.price),
      bosPerPanelZl: numOr(s.bosPerPanelZl, ESTIMATE_DEFAULT.bosPerPanelZl),
      laborPerPanelZl: numOr(s.laborPerPanelZl, ESTIMATE_DEFAULT.laborPerPanelZl),
      panelsPerDay: numOr(s.panelsPerDay, ESTIMATE_DEFAULT.panelsPerDay),
    };
  }

  /** Polski format kwoty: 2 526 000,00 zł (niełamliwe spacje). */
  function money(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    const parts = v.toFixed(2).split(".");
    const grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
    return grouped + "," + parts[1] + " zł";
  }

  /** Powierzchnia z jednym miejscem po przecinku: 27,3 (zamiast 0,0033…). */
  function fmtArea(n) {
    return fmt(Math.round((Number(n) || 0) * 10) / 10);
  }

  /** Poprawna odmiana: 1 dzień roboczy, 2 dni robocze, 5 dni roboczych. */
  function daysPl(n) {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    const last = v % 10, last2 = v % 100;
    if (last === 1 && last2 !== 11) return v + " dzień roboczy";
    if (last >= 2 && last <= 4 && (last2 < 12 || last2 > 14)) return v + " dni robocze";
    return v + " dni roboczych";
  }

  /**
   * Koszty i czas realizacji dla zadanej liczby paneli. Domyślnie liczba
   * paneli wynika z powierzchni; aplikacja przekazuje wynik doboru z mocy
   * i powierzchni jako `panelsOverride`.
   * @param {number} ha powierzchnia po obrysie modułów (ha)
   * @param {number} kw moc deklarowana w formularzu
   * @param {object} [data] parametry modułu i kosztów
   * @param {number} [panelsOverride] liczba paneli z automatycznego doboru
   * @param {string} [placeText] rodzaj montażu — wpływa na treść ostrzeżenia
   */
  function estimate(ha, kw, data, panelsOverride, placeText) {
    const o = estimateOptions(data);
    const haVal = numOr(ha, 0);
    const kwVal = numOr(kw, 0);
    const usableAreaM2 = haVal * 10000 * (o.coveragePct / 100);
    const override = Number(panelsOverride);
    const hasOverride = panelsOverride !== null && panelsOverride !== undefined &&
      isFinite(override) && override >= 0;
    const panels = hasOverride ? Math.floor(override)
      : (o.panelAreaM2 > 0 ? Math.floor(usableAreaM2 / o.panelAreaM2 + 1e-9) : 0);
    const installedKw = panels * o.panelWp / 1000;
    const moduleZl = panels * o.modulePriceZl;
    const bosZl = panels * o.bosPerPanelZl;
    const materialZl = moduleZl + bosZl;
    const laborZl = panels * o.laborPerPanelZl;
    const totalZl = materialZl + laborZl;
    const days = panels > 0 && o.panelsPerDay > 0
      ? Math.ceil(panels / o.panelsPerDay) : 0;
    const deltaKw = installedKw - kwVal;

    let powerNote;
    if (!panels && hasOverride) {
      powerNote = "Przy zadanej mocy i powierzchni nie mieści się ani jeden moduł " +
                  "o przyjętych parametrach.";
    } else if (!panels) {
      powerNote = "Podaj dodatnią powierzchnię, aby policzyć liczbę paneli.";
    } else if (kwVal <= 0) {
      powerNote = "Uzupełnij moc w formularzu, aby porównać wynik z deklaracją.";
    } else if (Math.abs(deltaKw) / kwVal <= 0.1) {
      powerNote = "Moc wynikająca z liczby paneli jest zgodna z mocą deklarowaną " +
        "(różnica do 10%).";
    } else {
      const roof = /dach|elewacja/i.test(String(placeText || ""));
      const areaWord = roof ? "powierzchnię dachu" : "powierzchnię terenu";
      const coverWord = roof ? "pokrycie dachu" : "pokrycie powierzchni";
      powerNote = "Moc z liczby paneli różni się o " + fmt(Math.abs(deltaKw)) +
        " kW od mocy deklarowanej — sprawdź " + areaWord + ", " + coverWord +
        " lub moc wpisaną w formularzu.";
    }

    return {
      options: o,
      presetName: (presetById(o.preset) || {}).name || "Własne parametry",
      usableAreaM2: usableAreaM2,
      panelsFromOverride: hasOverride,
      panels: panels,
      panelWp: o.panelWp,
      installedKw: installedKw,
      moduleZl: moduleZl,
      bosZl: bosZl,
      materialZl: materialZl,
      laborZl: laborZl,
      totalZl: totalZl,
      perPanelZl: panels > 0 ? totalZl / panels : 0,
      days: days,
      panelsPerDay: o.panelsPerDay,
      deltaKw: deltaKw,
      powerNote: powerNote,
    };
  }

  /**
   * Wycena zawsze dotyczy tego samego modułu, który wygrał w rankingu.
   * W przeciwnym razie liczba paneli pochodziłaby z jednego wariantu, a moc
   * i cena modułu z drugiego (np. 10 paneli 600 Wp wycenione jako 440 Wp).
   */
  function estimateFromOptimizer(ha, kw, data, opt, placeText) {
    const rec = opt && opt.recommended;
    if (!rec) return estimate(ha, kw, data, 0, placeText);
    const merged = Object.assign({}, estimateOptions(data), {
      preset: rec.id,
      panelWp: rec.wp,
      panelAreaM2: rec.areaM2,
      modulePriceZl: rec.modulePriceZl,
    });
    const e = estimate(ha, kw, merged, rec.panels, placeText);
    const roof = /dach|elewacja/i.test(String(placeText || ""));
    const areaName = roof ? "powierzchni dachu/elewacji" : "powierzchni terenu";
    e.recommendedId = rec.id;
    e.recommendedName = rec.name;
    e.selectionScope =
      "Wycena dotyczy wariantu rekomendowanego w tabeli poniżej: " + rec.name +
      " · " + rec.panels + " szt. · " + fmt(rec.installedKw) + " kW.";
    if (!rec.meetsPower) {
      e.powerNote = "Powierzchnia " + areaName + " ogranicza moc: zmieściło się " +
        rec.areaPanels + " paneli zamiast " + rec.powerPanels +
        " potrzebnych do " + fmt(numOr(kw, 0)) + " kW.";
    } else {
      e.powerNote = "Dobrano " + rec.panels + " szt. — minimum potrzebne do mocy " +
        fmt(numOr(kw, 0)) + " kW (" + rec.powerPanels + " szt.) przy maksimum " +
        rec.areaPanels + " szt. z " + areaName + ".";
    }
    return e;
  }

  /**
   * Ranking modułów wg kosztu całkowitego (moduły + konstrukcja/falownik +
   * robocizna). Tryby "area" i "power" zostają dla zgodności z testami;
   * "both" (używany w aplikacji) bierze pod uwagę oba wejścia naraz:
   * liczba paneli = minimum z zapotrzebowania na moc i maksimum z powierzchni.
   * @param {"area"|"power"|"both"} mode
   * @param {number} ha powierzchnia dostępna (ha)
   * @param {number} kw moc docelowa (kW)
   * @param {object} [data] parametry modułu i kosztów
   * @param {string} [placeText] rodzaj montażu — doprecyzowuje uwagę o powierzchni
   */
  function optimize(mode, ha, kw, data, placeText) {
    const o = estimateOptions(data);
    const m = mode === "power" || mode === "both" ? mode : "area";
    const haVal = numOr(ha, 0), kwVal = numOr(kw, 0);
    const roof = /dach|elewacja/i.test(String(placeText || ""));
    const areaName = roof ? "dachu/elewacji" : "terenu";
    const coverage = o.coveragePct / 100;
    const usableM2 = haVal * 10000 * coverage;
    const list = MODULE_PRESETS.map(function (p) {
      const powerPanels = kwVal > 0 ? Math.ceil(kwVal * 1000 / p.wp - 1e-9) : 0;
      const areaPanels = p.area > 0 ? Math.floor(usableM2 / p.area + 1e-9) : 0;
      let panels, neededM2, neededHa, fitsArea, meetsPower, limitedBy;
      if (m === "power") {
        panels = powerPanels;
        neededM2 = panels * p.area;
        neededHa = coverage > 0 ? neededM2 / (10000 * coverage) : 0;
        fitsArea = coverage > 0 && (haVal <= 0 || neededHa <= haVal + 1e-9);
        meetsPower = kwVal <= 0 || panels * p.wp / 1000 >= kwVal - 1e-9;
        limitedBy = fitsArea ? "moc" : "powierzchnia";
      } else if (m === "both") {
        panels = Math.min(powerPanels || areaPanels, areaPanels);
        neededM2 = panels * p.area;
        neededHa = coverage > 0 ? neededM2 / (10000 * coverage) : 0;
        fitsArea = coverage > 0 && (haVal <= 0 || neededHa <= haVal + 1e-9);
        meetsPower = kwVal <= 0 || panels * p.wp / 1000 >= kwVal - 1e-9;
        limitedBy = kwVal <= 0 || areaPanels < powerPanels ? "powierzchnia" : "moc";
      } else {
        panels = areaPanels;
        neededM2 = panels * p.area;
        neededHa = haVal;
        fitsArea = true;
        meetsPower = kwVal <= 0 || panels * p.wp / 1000 >= kwVal - 1e-9;
        limitedBy = "powierzchnia";
      }
      const perPanelZl = p.price + o.bosPerPanelZl + o.laborPerPanelZl;
      return {
        id: p.id, name: p.name, shortName: p.short || p.name, wp: p.wp, areaM2: p.area,
        modulePriceZl: p.price, panels: panels,
        powerPanels: powerPanels, areaPanels: areaPanels,
        meetsPower: meetsPower, limitedBy: limitedBy,
        installedKw: panels * p.wp / 1000,
        neededM2: neededM2, neededHa: neededHa, fitsArea: fitsArea,
        perPanelZl: perPanelZl, totalZl: panels * perPanelZl,
        days: panels > 0 && o.panelsPerDay > 0
          ? Math.ceil(panels / o.panelsPerDay) : 0,
      };
    }).sort(function (a, b) {
      return a.totalZl - b.totalZl || a.id.localeCompare(b.id);
    });
    list.forEach(function (x, i) { x.rank = i + 1; });

    const cheapest = list[0] || null;
    const mostExpensive = list[list.length - 1] || null;
    const fitting = list.filter(function (x) { return x.fitsArea && x.panels > 0; });
    let recommended = null;
    if (m === "both") {
      const full = fitting.filter(function (x) { return x.meetsPower; });
      recommended = full.length ? full[0] : (fitting.length ? fitting[0] : null);
    } else {
      recommended = fitting.length ? fitting[0] : null;
    }
    let note;
    if (coverage <= 0) {
      note = "Pokrycie powierzchni musi być większe od zera.";
    } else if (m === "power" && kwVal <= 0) {
      note = "Podaj moc w formularzu, aby porównać warianty dla zadanej mocy.";
    } else if (m === "both" && kwVal <= 0 && haVal <= 0) {
      note = "Podaj moc albo powierzchnię, aby dobrać liczbę paneli.";
    } else if (m === "area" && haVal <= 0) {
      note = "Podaj powierzchnię w formularzu, aby porównać warianty dla zadanej powierzchni.";
    } else if (!list.some(function (x) { return x.panels > 0; })) {
      note = "Powierzchnia jest za mała, aby zmieścić choć jeden moduł.";
    } else if (m === "power" && !fitting.length) {
      note = "Żaden moduł nie mieści się w podanej powierzchni przy tym pokryciu — " +
             "zwiększ powierzchnię albo zmniejsz pokrycie.";
    } else if (m === "both" && !fitting.length) {
      note = "Żaden moduł nie mieści się w podanej powierzchni przy tym pokryciu — " +
             "zwiększ powierzchnię albo zmniejsz pokrycie.";
    } else if (m === "both" && recommended && !recommended.meetsPower) {
      note = "Powierzchnia " + areaName + " ogranicza moc: najtańszy wariant daje " +
             fmt(recommended.installedKw) + " kW z wymaganych " + fmt(kwVal) +
             " kW. Pokazano maksymalną liczbę paneli mieszczącą się na " + areaName + ".";
    } else {
      note = m === "both"
        ? "Liczba paneli to mniejsza z dwóch wartości: minimum potrzebne do zadanej " +
          "mocy oraz maksimum możliwe na dostępnej powierzchni " + areaName +
          ". Ranking od najtańszego wariantu; gdy powierzchnia ogranicza moc, " +
          "pokazano maksimum i osobną uwagę."
        : m === "power"
          ? "Ranking od najtańszego wariantu osiągającego zadaną moc. Rekomendacja " +
            "uwzględnia też dostępną powierzchnię " + areaName + "."
          : "Ranking od najtańszego wariantu mieszczącego się na podanej powierzchni " +
            areaName + ".";
    }

    return {
      mode: m, ha: haVal, kw: kwVal, coveragePct: o.coveragePct,
      list: list, cheapest: cheapest, recommended: recommended,
      savingsZl: cheapest && mostExpensive ? mostExpensive.totalZl - cheapest.totalZl : 0,
      note: note,
    };
  }

  /**
   * @param {boolean} roof
   * @param {boolean} protectedArea
   * @param {number} ha
   * @param {number} kw
   * @param {string} [placeText]
   * @param {string} [locationText]
   */
  function calculate(roof, protectedArea, ha, kw, placeText, locationText) {
    const threshold = protectedArea ? CHRON : INNY;
    const env = !roof && ha >= threshold;
    const perm = kw > POW;

    let n;
    if (kw <= PPOZ) n = 1;
    else if (kw <= MICRO) n = 2;
    else if (kw <= POW) n = roof ? 3 : 5;
    else if (kw <= BIG) n = roof ? 4 : (env ? 7 : 6);
    else n = roof ? 8 : (env ? 10 : 9);

    let envDesc, permDesc;
    if (roof) envDesc = "Dachy i elewacje są wyłączone";
    else if (env) envDesc = `Powierzchnia ${fmt(ha)} ha przekracza próg ${fmt(threshold)} ha`;
    else envDesc = `Powierzchnia ${fmt(ha)} ha jest poniżej progu ${fmt(threshold)} ha`;

    permDesc = perm
      ? `Moc ${fmt(kw)} kW przekracza 150 kW`
      : "Do 150 kW nie trzeba ani pozwolenia, ani zgłoszenia robót";

    const [pathName, pathRange, ids] = PATHS[n];
    const cnt = ids.length;
    const word = cnt === 1 ? "krok" : (cnt < 5 ? "kroki" : "kroków");
    const pathMeta = `${pathRange}. ${cnt} ${word}.`;

    let warning = null;
    if (kw <= POW && !roof && env) {
      warning = "Uwaga: moc do 150 kW, ale powierzchnia przekracza próg " +
        "środowiskowy. Strony gov.pl nie opisują takiego przypadku, " +
        "potwierdź w urzędzie.";
    }

    const steps = ids.map((i) => {
      let name = STEPS[i][0];
      if (OPTIONAL_STEPS.indexOf(i) >= 0) name += " (opcjonalnie)";
      return { name: name, desc: STEPS[i][1] };
    });

    return {
      place_text: placeText || "",
      location_text: locationText || "",
      ha: ha, kw: kw, env: env, perm: perm,
      env_desc: envDesc, perm_desc: permDesc,
      path_no: n, path_name: pathName, path_meta: pathMeta,
      warning: warning, steps: steps,
    };
  }


  // --------------------------------------------------------------------------
  // OZE — inne odnawialne źródła energii (zakładka informacyjno-kalkulatorowa)
  // --------------------------------------------------------------------------
  // Zakres kart opisowych zgodny z: gov.pl/web/edukacja-ekologiczna/
  // odnawialne-zrodla-energii-czym-sa-i-co-nalezy-o-nich-wiedziec (26.07.2022).
  // Nazwy kroków i linki do procedur pochodzą z wydruków Krajowego Punktu
  // Kontaktowego ds. OZE (gov.pl/web/kontaktoze), stan na 24.11.2026.
  // Kalkulatory i ścieżki formalne są ORIENTACYJNE. Nie kodujemy niezweryfikowanych
  // progów prawnych — elementy wymagające potwierdzenia są jawnie oznaczone.

  const OZE_DISCLAIMER =
    "Informacje mają charakter orientacyjny. Nie stanowią porady prawnej, " +
    "projektowej ani decyzji administracyjnej. Checklisty odzwierciedlają nazwy kroków " +
    "z wydruków Krajowego Punktu Kontaktowego ds. OZE (KPK gov.pl, stan na 24.11.2026); " +
    "nie przesądzają o wymaganiach dla konkretnej inwestycji. Przed realizacją potwierdź " +
    "wymagania we właściwych źródłach (gov.pl, biznes.gov.pl, URE, GDOŚ/Wody Polskie, " +
    "gmina/starostwo) oraz aktualnych przepisach.";

  const OZE_GOV_SOURCE = {
    label: "gov.pl — Edukacja ekologiczna: Odnawialne źródła energii. Czym są i co należy o nich wiedzieć?",
    url: "https://www.gov.pl/web/edukacja-ekologiczna/odnawialne-zrodla-energii-czym-sa-i-co-nalezy-o-nich-wiedziec",
    date: "26.07.2022",
    note: "Źródło opisowe; cytuje ustawę z 20.02.2015 r. o odnawialnych źródłach energii (Dz.U. 2015 poz. 478)."
  };

  const OZE_BGK_SOURCE = {
    label: "BGK — Przewodnik do sporządzania Analizy Wykonalności (projekty OZE), wrzesień 2024",
    url: "https://www.bgk.pl/files/public/Fundusze_Europejskie_dla_regionow/Przewodnik_do_analizy_wykonalnosci_OZE.pdf",
    date: "09.2024",
    note: "Materiał pomocniczy dla analizy wykonalności; nie zastępuje przepisów ani indywidualnej decyzji organu."
  };

  const OZE_KPK_SOURCE = {
    label: "Krajowy Punkt Kontaktowy ds. OZE (gov.pl) — wydruki procesów inwestycyjnych",
    url: "https://www.gov.pl/web/kontaktoze/",
    date: "24.11.2026",
    note: "Listy kroków są uproszczonym odwzorowaniem wydruków KPK. Zakres procedury zależy od konkretnego projektu."
  };

  function kpkSource(label, url, note) {
    return {
      label: label + " — KPK gov.pl",
      url: url,
      date: "24.11.2026",
      note: note || "Wydruk procesu inwestycyjnego."
    };
  }

  function ozeStep(name, desc, status, sourceHint) {
    return { name: name, desc: desc, status: status || "verify", sourceHint: sourceHint || "" };
  }

  const OZE_SOURCES = [
    {
      id: "pv",
      name: "Energetyka słoneczna (PV)",
      short: "PV",
      color: "#c8a24a",
      description: "Energia promieniowania słonecznego zamieniana na energię elektryczną lub ciepło. W tej aplikacji pełny moduł dotyczy instalacji fotowoltaicznej.",
      govPoints: [
        "Energia słoneczna jest wykorzystywana m.in. przez kolektory słoneczne i panele fotowoltaiczne.",
        "Jest dostępna powszechnie, ale zależy od nasłonecznienia, pory dnia i roku.",
        "KPK opisuje odrębne procesy dla instalacji fotowoltaicznych, kolektorów słonecznych i magazynów energii elektrycznej."
      ],
      calculator: { kind: "link", label: "Otwórz kalkulator PV", href: "#/pv" },
      formalPath: {
        title: "Ścieżka formalna PV — moduł główny i źródła pokrewne",
        summary: "Pełna ścieżka PV pozostaje w głównym module. Poniżej zestawienie źródeł KPK oraz tematów pokrewnych, których nie duplikujemy w kalkulatorze.",
        steps: [
          ozeStep("Kroki PV w głównym module", "Główny moduł zawiera ścieżkę PV z wydruków KPK: warunki przyłączenia, zgłoszenie mikroinstalacji lub pozwolenie na budowę, zawiadomienie o zakończeniu budowy oraz wpis do rejestru albo koncesja.", "ready", "KPK gov.pl — instalacje fotowoltaiczne"),
          ozeStep("Proces inwestycyjny kolektorów słonecznych", "KPK wskazuje, że przy standardowym procesie inwestycyjnym nie są wymagane procedury; wyjątki potwierdź w źródle.", "verify", "KPK gov.pl — proces inwestycyjny kolektorów słonecznych"),
          ozeStep("Zgłoszenie magazynu/uzyskanie warunków", "KPK opisuje odrębny proces inwestycyjny dla magazynów energii. Potwierdź jego zakres dla konkretnego projektu.", "verify", "KPK gov.pl — instalacja magazynu energii")
        ],
        sources: [
          OZE_GOV_SOURCE, OZE_BGK_SOURCE, OZE_KPK_SOURCE,
          kpkSource("PV — mikroinstalacja", "https://www.gov.pl/web/kontaktoze/mikroinstalacja-fotowoltaiczna-do-65-kw"),
          kpkSource("PV — mikroinstalacja (wyższa moc)", "https://www.gov.pl/web/kontaktoze/mikroinstalacja-fotowoltaiczna-powyzej-65-kw"),
          kpkSource("PV — mała instalacja nadachowa", "https://www.gov.pl/web/kontaktoze/instalacja-nadachowa"),
          kpkSource("PV — mała instalacja nadachowa (wyższa moc)", "https://www.gov.pl/web/kontaktoze/instalacja-nadachowa2"),
          kpkSource("PV — mała instalacja naziemna", "https://www.gov.pl/web/kontaktoze/instalacja-naziemna"),
          kpkSource("PV — mała instalacja naziemna, wariant A", "https://www.gov.pl/web/kontaktoze/powierzchnia-do-2ha-lub-do-05-ha-na-terenach-chronionych4"),
          kpkSource("PV — mała instalacja naziemna, wariant B", "https://www.gov.pl/web/kontaktoze/powierzchnia-powyzej-2ha-lub-powyzej-05-ha-na-terenach-chronionych3"),
          kpkSource("PV — wielkoskalowa instalacja nadachowa", "https://www.gov.pl/web/kontaktoze/instalacje-nadachowe2"),
          kpkSource("PV — wielkoskalowa instalacja naziemna, wariant A", "https://www.gov.pl/web/kontaktoze/powierzchnia-do-2ha-lub-do-05-ha-na-terenach-chronionych2"),
          kpkSource("PV — wielkoskalowa instalacja naziemna, wariant B", "https://www.gov.pl/web/kontaktoze/powierzchnia-powyzej-2ha-lub-powyzej-05-ha-na-terenach-chronionych2"),
          kpkSource("Kolektory słoneczne — proces inwestycyjny", "https://www.gov.pl/web/kontaktoze/proces-inwestycyjny-kolektorow-slonecznych2"),
          kpkSource("Magazyn energii elektrycznej", "https://www.gov.pl/web/kontaktoze/instalacja-magazynu-energii-elektrycznej-o-mocy-do-50-kw")
        ]
      }
    },
    {
      id: "wiatr",
      name: "Energetyka wiatrowa",
      short: "Wiatr",
      color: "#2f7f98",
      description: "Energia kinetyczna wiatru przetwarzana na energię elektryczną przez turbiny wiatrowe. Skala projektów może obejmować mikroinstalacje, instalacje przydomowe lub farmy wiatrowe.",
      govPoints: [
        "Energetyka wiatrowa wykorzystuje siłę wiatru do napędu turbin.",
        "Lokalizacja zależy od warunków wiatrowych i uwarunkowań środowiskowych/przestrzennych.",
        "KPK rozróżnia mikroinstalacje nadachowe i naziemne, małe instalacje, wielkoskalowe farmy lądowe oraz morskie farmy wiatrowe."
      ],
      calculator: {
        kind: "wind",
        defaults: { powerKw: 10, diameterM: 5.5, windMs: 6.0, cp: 0.35, efficiency: 0.9, hoursYear: 2600, capexPlnKw: 9000, opexPct: 2.5 },
        fields: [
          { key: "powerKw", label: "Moc znamionowa turbiny [kW]", min: 0, step: 0.1 },
          { key: "diameterM", label: "Średnica wirnika [m]", min: 0, step: 0.1 },
          { key: "windMs", label: "Średnia prędkość wiatru [m/s]", min: 0, step: 0.1 },
          { key: "cp", label: "Współczynnik mocy Cp (0–0,59)", min: 0, max: 0.59, step: 0.01 },
          { key: "efficiency", label: "Sprawność układu [0–1]", min: 0, max: 1, step: 0.01 },
          { key: "hoursYear", label: "Równoważne godziny pracy [h/rok]", min: 0, step: 1 },
          { key: "capexPlnKw", label: "CAPEX orientacyjny [zł/kW]", min: 0, step: 100 },
          { key: "opexPct", label: "OPEX roczny [% CAPEX]", min: 0, step: 0.1 }
        ]
      },
      formalPath: {
        title: "Ścieżka formalna — energetyka wiatrowa",
        summary: "Kroki uporządkowane. Konkretne progi, decyzje i wyjątki w zależności do lokalizacji i skali projektu.",
        steps: [
          ozeStep("Uzyskanie decyzji o środowiskowych uwarunkowaniach", "KPK wskazuje decyzję środowiskową jako pierwszy etap w typowej ścieżce lądowych instalacji wiatrowych. Potwierdź zakres dla projektu.", "verify", "KPK gov.pl — instalacje wiatrowe na lądzie"),
          ozeStep("Planistyka", "Krok „Planistyka” w procedurach KPK: sprawdź plan miejscowy albo warunki zabudowy oraz uwarunkowania lokalizacyjne.", "verify", "KPK gov.pl — mała i wielkoskalowa instalacja wiatrowa"),
          ozeStep("Zgłoszenie wykonywania robót budowlanych lub zgłoszenie mikroinstalacji", "Dla części mikroinstalacji KPK przewiduje zgłoszenie robót, dla pozostałych zgłoszenie mikroinstalacji. Właściwy tryb potwierdź w źródle.", "verify", "KPK gov.pl — mikroinstalacje wiatrowe"),
          ozeStep("Uzyskanie warunków przyłączenia do sieci", "KPK podaje jako odrębny krok uzyskanie warunków przyłączenia lub zgłoszenie mikroinstalacji w zależności od wariantu.", "verify", "KPK gov.pl — proces przyłączeniowy"),
          ozeStep("Uzyskanie pozwolenia na budowę", "W ścieżkach opisanych przez KPK pozwolenie na budowę jest podstawą rozpoczęcia prac budowlanych.", "verify", "KPK gov.pl — mała i wielkoskalowa instalacja wiatrowa"),
          ozeStep("Uzyskanie pozwolenia na użytkowanie", "Część ścieżek KPK kończy się uzyskaniem pozwolenia na użytkowanie.", "verify", "KPK gov.pl — instalacje wiatrowe na lądzie"),
          ozeStep("Wpis do rejestru wytwórców energii w małej instalacji OZE lub koncesja", "KPK rozróżnia wpis do rejestru i koncesję na wytwarzanie energii. Wybór zależy od skali i modelu działalności.", "verify", "KPK gov.pl — rejestr i koncesje"),
          ozeStep("Uzyskanie decyzji o środowiskowych uwarunkowaniach dla całej inwestycji", "Krok z odrębnego procesu dla morskich farm wiatrowych; pozostałe decyzje, zgody i ekspertyzy potwierdź w źródle.", "verify", "KPK gov.pl — proces inwestycyjny morskich farm wiatrowych")
        ],
        sources: [
          OZE_GOV_SOURCE, OZE_BGK_SOURCE, OZE_KPK_SOURCE,
          kpkSource("Wiatr — mikroinstalacja nadachowa, wariant A", "https://www.gov.pl/web/kontaktoze/mikroinstalacja-o-wys-do-3-m"),
          kpkSource("Wiatr — mikroinstalacja nadachowa, wariant B", "https://www.gov.pl/web/kontaktoze/mikroinstalacja-o-wys-pow-3-m2"),
          kpkSource("Wiatr — mikroinstalacja naziemna", "https://www.gov.pl/web/kontaktoze/mikroinstalacja-wiatrowa-naziemna"),
          kpkSource("Wiatr — mała instalacja", "https://www.gov.pl/web/kontaktoze/mala-instalacja-50-kw---1-mw"),
          kpkSource("Wiatr — wielkoskalowa instalacja", "https://www.gov.pl/web/kontaktoze/wielkoskalowa-instalacja-pow-1-mw"),
          kpkSource("Morskie farmy wiatrowe — proces inwestycyjny", "https://www.gov.pl/web/kontaktoze/proces-inwestycyjny-morskich-farm-wiatrowych")
        ]
      }
    },
    {
      id: "woda",
      name: "Energetyka wodna",
      short: "Woda",
      color: "#1f6d8c",
      description: "Energia przepływu lub spadku wody wykorzystywana w elektrowniach wodnych. Wymaga szczególnej oceny hydrologicznej i wodnoprawnej.",
      govPoints: [
        "Energetyka wodna wykorzystuje energię płynącej wody do produkcji energii elektrycznej.",
        "Małe elektrownie wodne mogą być lokalnym źródłem energii, ale wymagają oceny wpływu na środowisko wodne.",
        "KPK opisuje mikro-, małe i wielkoskalowe instalacje wodne jako odrębne procesy."
      ],
      calculator: {
        kind: "hydro",
        defaults: { flowLps: 250, headM: 8, efficiency: 0.7, hoursYear: 4500, capexPlnKw: 12000, opexPct: 2.0 },
        fields: [
          { key: "flowLps", label: "Przepływ [l/s]", min: 0, step: 1 },
          { key: "headM", label: "Spadek [m]", min: 0, step: 0.1 },
          { key: "efficiency", label: "Sprawność całkowita [0–1]", min: 0, max: 1, step: 0.01 },
          { key: "hoursYear", label: "Godziny pracy [h/rok]", min: 0, step: 1 },
          { key: "capexPlnKw", label: "CAPEX orientacyjny [zł/kW]", min: 0, step: 100 },
          { key: "opexPct", label: "OPEX roczny [% CAPEX]", min: 0, step: 0.1 }
        ]
      },
      formalPath: {
        title: "Ścieżka formalna — energetyka wodna",
        summary: "Kroki uporządkowane. Zakres wymagań wodnoprawnych i środowiskowych w zależności do konkretnego cieku i inwestycji.",
        steps: [
          ozeStep("Uzyskanie decyzji o środowiskowych uwarunkowaniach", "KPK wskazuje decyzję środowiskową jako pierwszy etap procesu inwestycyjno-budowlanego elektrowni wodnej.", "verify", "KPK gov.pl — mikro, mała i wielkoskalowa instalacja wodna"),
          ozeStep("Procedury planistyczne", "Krok KPK dotyczący ustaleń planistycznych i warunków zagospodarowania terenu.", "verify", "KPK gov.pl — instalacje wodne"),
          ozeStep("Uzyskanie pozwolenia wodnoprawnego", "Osobny krok KPK dla robót i urządzeń wodnych. Zakres potwierdź z właściwym organem wodnym.", "verify", "KPK gov.pl — pozwolenie wodnoprawne"),
          ozeStep("Zawarcie umowy użytkowania gruntu pod wodami", "KPK uwzględnia umowę użytkowania gruntu pod wodami jako element ścieżki.", "verify", "KPK gov.pl — instalacje wodne"),
          ozeStep("Uzyskanie warunków przyłączenia do sieci lub zgłoszenie mikroinstalacji", "KPK rozróżnia tryb mikroinstalacji oraz uzyskanie warunków przyłączenia w zależności od wariantu.", "verify", "KPK gov.pl — przyłączenie do sieci"),
          ozeStep("Uzyskanie pozwolenia na budowę", "Podstawa rozpoczęcia prac budowlanych w procesach opisanych przez KPK.", "verify", "KPK gov.pl — instalacje wodne"),
          ozeStep("Uzyskanie pozwolenia na użytkowanie", "KPK kończy część ścieżek uzyskaniem pozwolenia na użytkowanie.", "verify", "KPK gov.pl — instalacje wodne"),
          ozeStep("Wpis do rejestru, koncesja lub rozpoczęcie działalności przedkoncesyjnej", "KPK rozróżnia wpis do rejestru wytwórców energii w małej instalacji OZE, koncesję oraz opcjonalne rozpoczęcie działalności przedkoncesyjnej.", "verify", "KPK gov.pl — wielkoskalowa instalacja wodna")
        ],
        sources: [
          OZE_GOV_SOURCE, OZE_BGK_SOURCE, OZE_KPK_SOURCE,
          kpkSource("Woda — mikroinstalacja", "https://www.gov.pl/web/kontaktoze/mikroinstalacja5"),
          kpkSource("Woda — mała instalacja", "https://www.gov.pl/web/kontaktoze/mala-instalacja6"),
          kpkSource("Woda — wielkoskalowa instalacja", "https://www.gov.pl/web/kontaktoze/wielkoskalowa-instalacja5")
        ]
      }
    },
    {
      id: "geotermia",
      name: "Energetyka geotermalna / pompy ciepła",
      short: "Geo",
      color: "#7a4f2a",
      description: "Wykorzystanie ciepła Ziemi: od płytkich instalacji z pompami ciepła po głęboką geotermię. Formalności zależą od technologii, sposobu korzystania z wód i zakresu robót geologicznych.",
      govPoints: [
        "Geotermia wykorzystuje ciepło wnętrza Ziemi, m.in. wody geotermalne i gruntowe.",
        "Może służyć do ogrzewania, ciepłej wody użytkowej lub produkcji energii elektrycznej w odpowiednich warunkach.",
        "KPK rozróżnia pompy ciepła, rozpoznanie warunków geologicznych, poszukiwanie wód termalnych i realizację inwestycji."
      ],
      calculator: {
        kind: "geo",
        defaults: { heatDemandKw: 12, cop: 4.0, hoursSeason: 2000, electricityPlnMwh: 900, capexPlnKw: 4500, opexPct: 1.5 },
        fields: [
          { key: "heatDemandKw", label: "Zapotrzebowanie na ciepło [kW]", min: 0, step: 0.1 },
          { key: "cop", label: "COP/SCOP [–]", min: 0.1, step: 0.1 },
          { key: "hoursSeason", label: "Godziny pracy sezonowej [h/rok]", min: 0, step: 1 },
          { key: "electricityPlnMwh", label: "Cena energii el. [zł/MWh]", min: 0, step: 10 },
          { key: "capexPlnKw", label: "CAPEX orientacyjny [zł/kW ciepła]", min: 0, step: 100 },
          { key: "opexPct", label: "OPEX roczny [% CAPEX]", min: 0, step: 0.1 }
        ]
      },
      formalPath: {
        title: "Ścieżka formalna — geotermia / pompy ciepła",
        summary: "Kroki zestawione z wydruków KPK dla pomp ciepła, robót geologicznych, wód termalnych i realizacji inwestycji. Wymagania zależą od technologii i lokalizacji.",
        steps: [
          ozeStep("Powietrzna pompa ciepła", "KPK opisuje powietrzną pompę ciepła jako niemal maksymalnie odformalizowaną; dla gruntowej do 30 m wskazuje brak procedur przy standardowym procesie. Ewentualne obowiązki (np. CRO) potwierdź w źródle.", "verify", "KPK gov.pl — powietrzna i gruntowa pompa ciepła do 30 m"),
          ozeStep("Rozpoznanie warunków geologicznych i hydrogeologicznych", "KPK opisuje odrębny krok rozpoznania warunków w miejscu inwestycji przed dalszymi robotami.", "verify", "KPK gov.pl — rozpoznanie warunków geologicznych i hydrogeologicznych"),
          ozeStep("Zatwierdzenie projektu robót geologicznych i zgłoszenie rozpoczęcia robót", "Dla prac geologicznych KPK podaje zatwierdzenie projektu oraz zgłoszenie rozpoczęcia robót. W wybranych wariantach występuje też plan ruchu zakładu górniczego.", "verify", "KPK gov.pl — odwierty i roboty geologiczne"),
          ozeStep("Zgłoszenie wodnoprawne lub pozwolenie wodnoprawne", "Krok KPK przy korzystaniu z wód lub oddziaływaniu na stosunki wodne. Zakres potwierdź z organem wodnym.", "verify", "KPK gov.pl — wody termalne i odwierty"),
          ozeStep("Decyzja o środowiskowych uwarunkowaniach i procedury planistyczne", "Decyzja środowiskowa i ustalenia planistyczne występują jako etapy procesu inwestycyjnego w wydrukach KPK.", "verify", "KPK gov.pl — realizacja inwestycji"),
          ozeStep("Warunki przyłączenia do sieci ciepłowniczej i do sieci", "KPK rozróżnia przyłączenie ciepłownicze oraz przyłączenie elektryczne; potwierdź, które dotyczy projektu.", "verify", "KPK gov.pl — realizacja inwestycji"),
          ozeStep("Uzyskanie pozwolenia na budowę i pozwolenia na użytkowanie", "Podstawa realizacji i zakończenia inwestycji w ścieżce opisanej przez KPK.", "verify", "KPK gov.pl — realizacja inwestycji"),
          ozeStep("Dokumentacja hydrogeologiczna i koncesje (gdy dotyczy)", "KPK przewiduje zatwierdzenie dokumentacji hydrogeologicznej, koncesję na eksploatację wód termalnych oraz opcjonalną koncesję na wytwarzanie ciepła lub energii.", "verify", "KPK gov.pl — wody termalne i realizacja inwestycji")
        ],
        sources: [
          OZE_GOV_SOURCE, OZE_BGK_SOURCE, OZE_KPK_SOURCE,
          kpkSource("Geotermia — instalacje geotermalne", "https://www.gov.pl/web/kontaktoze/instalacje-geotermalne"),
          kpkSource("Geotermia — poszukiwanie i rozpoznawanie wód termalnych", "https://www.gov.pl/web/kontaktoze/poszukiwanie-i-rozpoznawanie-wod-termalnych4"),
          kpkSource("Geotermia — realizacja inwestycji", "https://www.gov.pl/web/kontaktoze/realizacja-inwestycji4"),
          kpkSource("Pompa ciepła — powietrzna", "https://www.gov.pl/web/kontaktoze/powietrzna-pompa-ciepla"),
          kpkSource("Pompa ciepła — gruntowa, wariant A", "https://www.gov.pl/web/kontaktoze/odwiert-do-30-m"),
          kpkSource("Pompa ciepła — gruntowa, wariant B", "https://www.gov.pl/web/kontaktoze/odwiert-od-30-do-100-m"),
          kpkSource("Pompa ciepła — gruntowa, wariant C", "https://www.gov.pl/web/kontaktoze/odwiert-powyzej-100-m"),
          kpkSource("Rozpoznanie warunków geologicznych i hydrogeologicznych", "https://www.gov.pl/web/kontaktoze/rozpoznawanie-warunkow-geologicznych-i-hydrogeologicznych")
        ]
      }
    },
    {
      id: "biomasa",
      name: "BIO",
      short: "BIO",
      color: "#4f7a2f",
      description: "Energia z materii organicznej: biomasa stała, biogaz/biometan i biopłyny. Wymagania zależą od paliwa, technologii, emisji i sposobu wykorzystania energii.",
      govPoints: [
        "Biomasa to materia organiczna wykorzystywana do produkcji ciepła, energii elektrycznej lub paliw.",
        "Biogaz powstaje m.in. w procesie fermentacji; biopłyny to paliwa ciekłe pochodzenia biologicznego.",
        "KPK obejmuje instalacje biomasowe, biogazowe, biometanowe oraz wykorzystujące biopłyny."
      ],
      calculator: {
        kind: "biomass",
        defaults: { fuelTonsYear: 120, gcvKwhKg: 4.2, efficiency: 0.75, hoursYear: 4000, pricePlnTon: 900, capexPlnKw: 5000, opexPct: 4.0 },
        fields: [
          { key: "fuelTonsYear", label: "Paliwo/substrat [t/rok]", min: 0, step: 0.1 },
          { key: "gcvKwhKg", label: "Wartość opałowa [kWh/kg]", min: 0, step: 0.01 },
          { key: "efficiency", label: "Sprawność systemu [0–1]", min: 0, max: 1, step: 0.01 },
          { key: "hoursYear", label: "Godziny pracy [h/rok]", min: 0, step: 1 },
          { key: "pricePlnTon", label: "Koszt paliwa [zł/t]", min: 0, step: 1 },
          { key: "capexPlnKw", label: "CAPEX orientacyjny [zł/kW]", min: 0, step: 100 },
          { key: "opexPct", label: "OPEX roczny [% CAPEX]", min: 0, step: 0.1 }
        ]
      },
      formalPath: {
        title: "Ścieżka formalna — biomasa / biogaz / biopłyny",
        summary: "Kroki wspólne dla wydruków KPK dotyczących biomasy, biogazu, biometanu i biopłynów. Szczegóły zależą od paliwa, technologii i lokalizacji.",
        steps: [
          ozeStep("Decyzja o środowiskowych uwarunkowaniach i procedury planistyczne", "KPK wskazuje decyzję środowiskową oraz procedury planistyczne jako etapy typowej ścieżki inwestycyjnej instalacji biomasowych, biogazowych i biopłynowych.", "verify", "KPK gov.pl — instalacje biomasowe, biogazowe, biometanowe i biopłynowe"),
          ozeStep("Uzyskanie pozwoleń środowiskowych", "KPK podaje jako odrębny krok pozwolenia środowiskowe dla instalacji przetwarzających biomasę lub paliwa biologiczne.", "verify", "KPK gov.pl — pozwolenia środowiskowe"),
          ozeStep("Zgłoszenie wykonywania robót budowlanych lub uzyskanie pozwolenia na budowę", "KPK rozróżnia zgłoszenie robót i pozwolenie na budowę w zależności od wariantu instalacji.", "verify", "KPK gov.pl — mikro, mała i wielkoskalowa instalacja"),
          ozeStep("Warunki przyłączenia do sieci, sieci ciepłowniczej lub gazowej oraz zgłoszenie mikroinstalacji", "KPK rozróżnia przyłączenie energetyczne, ciepłownicze i gazowe; zakres zależy od technologii i sposobu wykorzystania energii.", "verify", "KPK gov.pl — przyłączenia i mikroinstalacje"),
          ozeStep("Uzyskanie pozwolenia na użytkowanie", "Element ścieżki KPK kończący proces budowlany dla części instalacji.", "verify", "KPK gov.pl — instalacje biomasowe i biogazowe"),
          ozeStep("Zawiadomienie Państwowej Straży Pożarnej (PSP)", "KPK uwzględnia zawiadomienie PSP w ścieżkach biogazowych i biometanowych. Potwierdź zakres dla projektu.", "verify", "KPK gov.pl — mikroinstalacje biogazowe i biometanowe"),
          ozeStep("Wpis do rejestru wytwórców biogazu rolniczego/biopłynów lub koncesja", "KPK rozróżnia wpis do rejestru, koncesję na wytwarzanie ciepła i koncesję na energię elektryczną; wybór zależy od działalności.", "verify", "KPK gov.pl — rejestr i koncesje"),
          ozeStep("Rozpoczęcie działalności przedkoncesyjnej (opcjonalnie)", "KPK oznacza ten krok jako opcjonalny w wybranych wariantach wielkoskalowych.", "verify", "KPK gov.pl — wielkoskalowe instalacje biogazowe i biopłynowe")
        ],
        sources: [
          OZE_GOV_SOURCE, OZE_BGK_SOURCE, OZE_KPK_SOURCE,
          kpkSource("Biomasa — mikroinstalacja", "https://www.gov.pl/web/kontaktoze/mikroinstalacja-biomasowa"),
          kpkSource("Biomasa — mała instalacja", "https://www.gov.pl/web/kontaktoze/mala-instalacja-biomasowa"),
          kpkSource("Biomasa — wielkoskalowa instalacja", "https://www.gov.pl/web/kontaktoze/wielkoskalowa-instalacja-biomasowa"),
          kpkSource("Biogaz — mikroinstalacja", "https://www.gov.pl/web/kontaktoze/mikroinstalacja2"),
          kpkSource("Biogaz — mała instalacja", "https://www.gov.pl/web/kontaktoze/mala-instalacja4"),
          kpkSource("Biogaz — wielkoskalowa instalacja", "https://www.gov.pl/web/kontaktoze/wielkoskalowa-instalacja2"),
          kpkSource("Biometan — mikroinstalacja", "https://www.gov.pl/web/kontaktoze/mikroinstalacja10"),
          kpkSource("Biometan — mała instalacja", "https://www.gov.pl/web/kontaktoze/instalacja-do-500-kw6"),
          kpkSource("Biometan — wielkoskalowa instalacja", "https://www.gov.pl/web/kontaktoze/wielkoskalowa-instalacja11"),
          kpkSource("Biopłyny — mikroinstalacja", "https://www.gov.pl/web/kontaktoze/mikroinstalacja4"),
          kpkSource("Biopłyny — mała instalacja", "https://www.gov.pl/web/kontaktoze/mala-instalacja5"),
          kpkSource("Biopłyny — wielkoskalowa instalacja", "https://www.gov.pl/web/kontaktoze/wielkoskalowa-instalacja4")
        ]
      }
    }
  ];

  function ozeById(id) {
    for (let i = 0; i < OZE_SOURCES.length; i++) if (OZE_SOURCES[i].id === id) return OZE_SOURCES[i];
    return OZE_SOURCES[0];
  }

  function num(x, fallback) { const n = Number(x); return Number.isFinite(n) ? n : (fallback || 0); }
  function clamp(x, min, max) { x = num(x, min); if (x < min) x = min; if (x > max) x = max; return x; }

  function calcWind(input) {
    const d = input || {};
    const powerKw = Math.max(0, num(d.powerKw, 10));
    const diameterM = Math.max(0, num(d.diameterM, 5.5));
    const windMs = Math.max(0, num(d.windMs, 6));
    const cp = clamp(d.cp, 0, 0.59);
    const efficiency = clamp(d.efficiency, 0, 1);
    const hoursYear = Math.max(0, num(d.hoursYear, 2600));
    const capexPlnKw = Math.max(0, num(d.capexPlnKw, 9000));
    const opexPct = Math.max(0, num(d.opexPct, 2.5));
    const rho = 1.225;
    const area = Math.PI * Math.pow(diameterM / 2, 2);
    const pKw = (0.5 * rho * area * Math.pow(windMs, 3) * cp * efficiency) / 1000;
    const energyKwhYear = pKw * hoursYear;
    const capex = powerKw * capexPlnKw;
    return { areaM2: area, powerFromWindKw: pKw, energyMwhYear: energyKwhYear / 1000, capexPln: capex, opexPlnYear: capex * (opexPct / 100),
      assumptions: ["Wzór orientacyjny: P = 0,5 · ρ · A · v³ · Cp · η; ρ = 1,225 kg/m³.", "Rzeczywista produkcja zależy od krzywej mocy turbiny, rozkładu wiatru, strat i ograniczeń sieciowych.", "CAPEX/OPEX są orientacyjne — wymagają oferty i analizy lokalnej."] };
  }

  function calcHydro(input) {
    const d = input || {};
    const flowLps = Math.max(0, num(d.flowLps, 250));
    const headM = Math.max(0, num(d.headM, 8));
    const efficiency = clamp(d.efficiency, 0, 1);
    const hoursYear = Math.max(0, num(d.hoursYear, 4500));
    const capexPlnKw = Math.max(0, num(d.capexPlnKw, 12000));
    const opexPct = Math.max(0, num(d.opexPct, 2));
    const q = flowLps / 1000;
    const pKw = (1000 * 9.81 * q * headM * efficiency) / 1000;
    const capex = pKw * capexPlnKw;
    return { flowM3s: q, powerKw: pKw, energyMwhYear: (pKw * hoursYear) / 1000, capexPln: capex, opexPlnYear: capex * (opexPct / 100),
      assumptions: ["Wzór orientacyjny: P = ρ · g · Q · H · η; ρ=1000 kg/m³, g=9,81 m/s².", "Nie uwzględnia zmienności przepływu, przepływu nienaruszalnego, strat hydrotechnicznych ani ograniczeń środowiskowych.", "Wymagana weryfikacja hydrologiczna i wodnoprawna."] };
  }

  function calcGeo(input) {
    const d = input || {};
    const heatDemandKw = Math.max(0, num(d.heatDemandKw, 12));
    const cop = Math.max(0.1, num(d.cop, 4));
    const hoursSeason = Math.max(0, num(d.hoursSeason, 2000));
    const electricityPlnMwh = Math.max(0, num(d.electricityPlnMwh, 900));
    const capexPlnKw = Math.max(0, num(d.capexPlnKw, 4500));
    const opexPct = Math.max(0, num(d.opexPct, 1.5));
    const heatKwhYear = heatDemandKw * hoursSeason;
    const elKwhYear = cop > 0 ? heatKwhYear / cop : 0;
    const capex = heatDemandKw * capexPlnKw;
    return { heatMwhYear: heatKwhYear / 1000, electricityMwhYear: elKwhYear / 1000, electricityCostPlnYear: (elKwhYear / 1000) * electricityPlnMwh, capexPln: capex, opexPlnYear: capex * (opexPct / 100),
      assumptions: ["Wzór orientacyjny: E_el = E_ciepła / COP; E_ciepła = moc_ciepła · godziny.", "COP/SCOP zależy od temperatury źródła, emiterów ciepła, sterowania i jakości wykonania.", "CAPEX/OPEX orientacyjne; dla gruntowych/wodnych/głębokiej geotermii wymagany projekt."] };
  }

  function calcBiomass(input) {
    const d = input || {};
    const fuelTonsYear = Math.max(0, num(d.fuelTonsYear, 120));
    const gcvKwhKg = Math.max(0, num(d.gcvKwhKg, 4.2));
    const efficiency = clamp(d.efficiency, 0, 1);
    const hoursYear = Math.max(0, num(d.hoursYear, 4000));
    const pricePlnTon = Math.max(0, num(d.pricePlnTon, 900));
    const capexPlnKw = Math.max(0, num(d.capexPlnKw, 5000));
    const opexPct = Math.max(0, num(d.opexPct, 4));
    const energyKwhYear = fuelTonsYear * 1000 * gcvKwhKg * efficiency;
    const avgPowerKw = hoursYear > 0 ? energyKwhYear / hoursYear : 0;
    const capex = avgPowerKw * capexPlnKw;
    return { energyMwhYear: energyKwhYear / 1000, avgPowerKw: avgPowerKw, fuelCostPlnYear: fuelTonsYear * pricePlnTon, capexPln: capex, opexPlnYear: capex * (opexPct / 100),
      assumptions: ["Wzór orientacyjny: E_użyteczna = masa · wartość opałowa · sprawność.", "Nie zastępuje analizy paliwa, wilgotności, emisji, logistyki i wymagań środowiskowych.", "Dla biogazu/biometanu/biopłynów parametry należy dobrać wg konkretnej technologii."] };
  }

  function ozeCalculate(sourceId, input) {
    if (sourceId === "wiatr") return calcWind(input);
    if (sourceId === "woda") return calcHydro(input);
    if (sourceId === "geotermia") return calcGeo(input);
    if (sourceId === "biomasa") return calcBiomass(input);
    return null;
  }

  function ozeDefaultInput(sourceId) {
    const s = ozeById(sourceId);
    if (!s.calculator || !s.calculator.defaults) return {};
    return JSON.parse(JSON.stringify(s.calculator.defaults));
  }

  const COMPARE_DEFAULT = { pricePlnMwh: 800, pvYieldKwhKwYear: 1050, pvOpexPctYear: 1.5 };

  function compareMetrics(sourceId, calcResult, input, compareOpts) {
    const opts = compareOpts || COMPARE_DEFAULT;
    const price = Math.max(0, num(opts.pricePlnMwh, COMPARE_DEFAULT.pricePlnMwh));
    const r = calcResult || {};
    let energyMwhYear = 0, capexPln = 0, opexPlnYear = 0, label = "";
    if (sourceId === "pv") {
      energyMwhYear = Math.max(0, num(r.energyMwhYear, 0));
      capexPln = Math.max(0, num(r.capexPln, 0));
      opexPlnYear = Math.max(0, num(r.opexPlnYear, 0));
      label = "Energia elektryczna";
    } else if (sourceId === "wiatr") {
      energyMwhYear = Math.max(0, num(r.energyMwhYear, 0));
      capexPln = Math.max(0, num(r.capexPln, 0));
      opexPlnYear = Math.max(0, num(r.opexPlnYear, 0));
      label = "Energia elektryczna";
    } else if (sourceId === "woda") {
      energyMwhYear = Math.max(0, num(r.energyMwhYear, 0));
      capexPln = Math.max(0, num(r.capexPln, 0));
      opexPlnYear = Math.max(0, num(r.opexPlnYear, 0));
      label = "Energia elektryczna";
    } else if (sourceId === "geotermia") {
      energyMwhYear = Math.max(0, num(r.heatMwhYear, 0));
      capexPln = Math.max(0, num(r.capexPln, 0));
      const elCost = Math.max(0, num(r.electricityCostPlnYear, 0));
      opexPlnYear = Math.max(0, num(r.opexPlnYear, 0)) + elCost;
      label = "Ciepło użyteczne";
    } else if (sourceId === "biomasa") {
      energyMwhYear = Math.max(0, num(r.energyMwhYear, 0));
      capexPln = Math.max(0, num(r.capexPln, 0));
      const fuel = Math.max(0, num(r.fuelCostPlnYear, 0));
      opexPlnYear = Math.max(0, num(r.opexPlnYear, 0)) + fuel;
      label = "Energia użyteczna";
    }
    const revenuePlnYear = energyMwhYear * price;
    const netPlnYear = revenuePlnYear - opexPlnYear;
    const paybackYears = netPlnYear > 0 ? capexPln / netPlnYear : null;
    const lcoeLikePlnMwh = energyMwhYear > 0 ? (opexPlnYear + capexPln / 20) / energyMwhYear : null;
    return {
      sourceId: sourceId, label: label,
      energyMwhYear: energyMwhYear, capexPln: capexPln, opexPlnYear: opexPlnYear,
      revenuePlnYear: revenuePlnYear, netPlnYear: netPlnYear,
      paybackYears: paybackYears, lcoeLikePlnMwh: lcoeLikePlnMwh,
      pricePlnMwh: price
    };
  }

  root.PVModel = {
    VERSION: VERSION, PLACE_GROUND: PLACE_GROUND, PLACE_ROOF: PLACE_ROOF, LOC_NORMAL: LOC_NORMAL, LOC_PROTECTED: LOC_PROTECTED,
    SOURCE_LINE: SOURCE_LINE, DISCLAIMER: DISCLAIMER, AUTHOR_LINE: AUTHOR_LINE, THRESHOLDS_LINE: THRESHOLDS_LINE,
    COST_SOURCE_LINE: COST_SOURCE_LINE, COST_BREAKDOWN_LINE: COST_BREAKDOWN_LINE,
    MODULE_PRESETS: MODULE_PRESETS, ESTIMATE_DEFAULT: ESTIMATE_DEFAULT,
    STEPS: STEPS, PATHS: PATHS, fmt: fmt, fmtPayback: fmtPayback, fmtArea: fmtArea,
    daysPl: daysPl, money: money, todayPl: todayPl, calculate: calculate,
    estimateOptions: estimateOptions, estimate: estimate,
    estimateFromOptimizer: estimateFromOptimizer, optimize: optimize,
    OZE_SOURCES: OZE_SOURCES, OZE_DISCLAIMER: OZE_DISCLAIMER, OZE_GOV_SOURCE: OZE_GOV_SOURCE, OZE_BGK_SOURCE: OZE_BGK_SOURCE, OZE_KPK_SOURCE: OZE_KPK_SOURCE,
    ozeById: ozeById, ozeDefaultInput: ozeDefaultInput, ozeCalculate: ozeCalculate,
    COMPARE_DEFAULT: COMPARE_DEFAULT, compareMetrics: compareMetrics,
  };
})(typeof window !== "undefined" ? window : globalThis);
