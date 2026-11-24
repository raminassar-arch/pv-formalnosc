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
      wp: 440, area: 1.95, price: 350 },
    { id: "longi445",    name: "Longi Hi-MO 5m 445W · Mono PERC",
      wp: 445, area: 1.85, price: 317 },
    { id: "trina445",    name: "Trina Vertex S+ 445W · TOPCon",
      wp: 445, area: 1.87, price: 326 },
    { id: "trina450",    name: "Trina Vertex S 450W · TOPCon bifacial",
      wp: 450, area: 1.92, price: 383 },
    { id: "suntech450",  name: "Suntech Ultra V 450W · Mono PERC",
      wp: 450, area: 1.94, price: 308 },
    { id: "selfa450",    name: "Selfa S450MH · Mono PERC (polska produkcja)",
      wp: 450, area: 1.94, price: 289 },
    { id: "jinko600",    name: "Jinko Tiger Neo 600W · N-type TOPCon bifacial",
      wp: 600, area: 2.70, price: 470 },
    { id: "longi600",    name: "Longi Hi-MO 7 600W · HPBC",
      wp: 600, area: 2.70, price: 490 },
    { id: "canadian600", name: "Canadian Solar HiKu7 600W · Mono PERC",
      wp: 600, area: 2.70, price: 455 },
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

  /**
   * Koszty i czas realizacji dla zadanej liczby paneli. Domyślnie liczba
   * paneli wynika z powierzchni; aplikacja przekazuje wynik doboru z mocy
   * i powierzchni jako `panelsOverride`.
   * @param {number} ha powierzchnia po obrysie modułów (ha)
   * @param {number} kw moc deklarowana w formularzu
   * @param {object} [data] parametry modułu i kosztów
   * @param {number} [panelsOverride] liczba paneli z automatycznego doboru
   */
  function estimate(ha, kw, data, panelsOverride) {
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
      powerNote = "Moc z liczby paneli różni się o " + fmt(Math.abs(deltaKw)) +
        " kW od mocy deklarowanej — sprawdź powierzchnię, pokrycie dachu lub moc " +
        "wpisaną w formularzu.";
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
   * Ranking modułów wg kosztu całkowitego (moduły + konstrukcja/falownik +
   * robocizna). Tryby "area" i "power" zostają dla zgodności z testami;
   * "both" (używany w aplikacji) bierze pod uwagę oba wejścia naraz:
   * liczba paneli = minimum z zapotrzebowania na moc i maksimum z powierzchni.
   * @param {"area"|"power"|"both"} mode
   * @param {number} ha powierzchnia dostępna (ha)
   * @param {number} kw moc docelowa (kW)
   * @param {object} [data] parametry modułu i kosztów
   */
  function optimize(mode, ha, kw, data) {
    const o = estimateOptions(data);
    const m = mode === "power" || mode === "both" ? mode : "area";
    const haVal = numOr(ha, 0), kwVal = numOr(kw, 0);
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
        id: p.id, name: p.name, wp: p.wp, areaM2: p.area,
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
      note = "Powierzchnia ogranicza moc: najtańszy wariant daje " +
             fmt(recommended.installedKw) + " kW z wymaganych " + fmt(kwVal) +
             " kW. Pokazano maksymalną liczbę paneli mieszczącą się na terenie.";
    } else {
      note = m === "both"
        ? "Liczba paneli to minimum z zapotrzebowania na moc i maksimum z powierzchni. " +
          "Ranking od najtańszego wariantu spełniającego oba warunki."
        : m === "power"
          ? "Ranking od najtańszego wariantu osiągającego zadaną moc. Rekomendacja " +
            "uwzględnia też dostępną powierzchnię."
          : "Ranking od najtańszego wariantu mieszczącego się na podanej powierzchni.";
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
  // Kalkulatory i ścieżki formalne są ORIENTACYJNE. Nie kodujemy niezweryfikowanych
  // progów prawnych — elementy wymagające potwierdzenia są jawnie oznaczone.

  const OZE_DISCLAIMER =
    "Informacje mają charakter orientacyjny i edukacyjny. Nie stanowią porady prawnej, " +
    "projektowej ani decyzji administracyjnej. Przed realizacją potwierdź wymagania w " +
    "właściwych źródłach (gov.pl, biznes.gov.pl, URE, GDOŚ/Wody Polskie, gmina/starostwo) " +
    "oraz aktualnych przepisach.";

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
        "Jest dostępna powszechnie, ale zależy od nasłonecznienia, pory dnia i roku."
      ],
      calculator: { kind: "link", label: "Otwórz kalkulator PV", href: "#/dane" },
      formalPath: {
        title: "Ścieżka formalna PV — moduł główny",
        summary: "Pełna ścieżka formalna PV jest już dostępna w zakładkach Dane/Wynik/Podgląd.",
        steps: [
          ozeStep("Użyj głównego modułu PV", "Przejdź do Dane, wpisz moc i powierzchnię, a następnie wygeneruj wynik i raport PDF.", "ready", "Moduł PV Formalność w tej aplikacji")
        ],
        sources: [OZE_GOV_SOURCE]
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
        "Lokalizacja zależy od warunków wiatrowych i uwarunkowań środowiskowych/przestrzennych."
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
        title: "Ścieżka formalna — energetyka wiatrowa (szkielet do potwierdzenia)",
        summary: "Lista kontrolna obejmuje typowe obszary formalne. Konkretne progi, wymagane decyzje i wyjątki należy potwierdzić dla lokalizacji i mocy.",
        steps: [
          ozeStep("Wstępna ocena lokalizacji i zasobów wiatru", "Sprawdź warunki wiatrowe, ograniczenia terenowe, sąsiedztwo zabudowy, infrastrukturę i dostęp do sieci.", "verify", "Analiza lokalizacji; prawo miejscowe/środowiskowe — do potwierdzenia"),
          ozeStep("Ustalenie statusu planistycznego", "Sprawdź MPZP/warunki zabudowy lub inne decyzje planistyczne. Dla energetyki wiatrowej często występują szczególne ograniczenia lokalizacyjne — wymagają potwierdzenia w aktualnych przepisach.", "verify", "Planowanie przestrzenne; przepisy szczególne — do potwierdzenia"),
          ozeStep("Przyłączenie do sieci / rozliczenie energii", "Ustal tryb przyłączenia, moc przyłączeniową, warunki techniczne lub procedurę dla mikro/małej instalacji.", "verify", "Operator sieci, Prawo energetyczne, ustawa OZE — do potwierdzenia"),
          ozeStep("Pozwolenia/zgłoszenia budowlane i środowiskowe", "Zweryfikuj, czy wymagane jest pozwolenie na budowę, zgłoszenie, ocena oddziaływania na środowisko lub inne decyzje. Zależy od skali i lokalizacji.", "verify", "Prawo budowlane, procedura OOŚ — do potwierdzenia"),
          ozeStep("Koncesja/rejestr/wytwórca", "Potwierdź, czy działalność wymaga koncesji, wpisu do rejestru, czy korzysta ze zwolnienia — zależnie od mocy i modelu.", "verify", "Prawo energetyczne / URE / ustawa OZE — do potwierdzenia"),
          ozeStep("Odbiory, eksploatacja i BHP", "Zapewnij odbiory techniczne, wymagania serwisowe, bezpieczeństwo i dokumentację powykonawczą.", "verify", "Przepisy techniczne, BHP, wymagania producenta/OSD")
        ],
        sources: [OZE_GOV_SOURCE, OZE_BGK_SOURCE]
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
        "Małe elektrownie wodne mogą być lokalnym źródłem energii, ale wymagają oceny wpływu na środowisko wodne."
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
        title: "Ścieżka formalna — energetyka wodna (szkielet do potwierdzenia)",
        summary: "Projekty wodne zwykle wymagają analizy wodnoprawnej i środowiskowej. Poniżej szkielet kontrolny — bez twardych progów.",
        steps: [
          ozeStep("Ocena hydrologiczna i lokalizacyjna", "Sprawdź przepływ, spadek, zmienność sezonową, dostęp do cieku, ograniczenia środowiskowe i możliwość przyłączenia.", "verify", "Dane hydrologiczne, analiza lokalna — do potwierdzenia"),
          ozeStep("Kwestie wodnoprawne", "Zweryfikuj, czy wymagane jest pozwolenie wodnoprawne, zgłoszenie wodnoprawne lub inne decyzje. Zakres zależy od rodzaju robót i oddziaływania.", "verify", "Prawo wodne / Wody Polskie — do potwierdzenia"),
          ozeStep("Środowisko i tereny chronione", "Sprawdź konieczność OOŚ, inwentaryzacji przyrodniczej, decyzji dot. terenów chronionych i przepływu nienaruszalnego.", "verify", "OOŚ, RDOŚ/GDOŚ, Wody Polskie — do potwierdzenia"),
          ozeStep("Planowanie przestrzenne i prawo budowlane", "Ustal MPZP/WZ lub inne warunki oraz wymagany tryb budowlany dla urządzeń, budowli i infrastruktury.", "verify", "Planowanie przestrzenne / Prawo budowlane — do potwierdzenia"),
          ozeStep("Przyłączenie, koncesja/rejestr", "Potwierdź warunki przyłączenia do sieci i status wytwórcy (koncesja, rejestr, zwolnienie) w zależności od mocy i modelu sprzedaży.", "verify", "Prawo energetyczne / URE / OSD — do potwierdzenia"),
          ozeStep("Eksploatacja i monitoring", "Ustal obowiązki eksploatacyjne, monitoring hydrologiczny/środowiskowy i serwis.", "verify", "Decyzje administracyjne, wymagania techniczne — do potwierdzenia")
        ],
        sources: [OZE_GOV_SOURCE, OZE_BGK_SOURCE]
      }
    },
    {
      id: "geotermia",
      name: "Energetyka geotermalna / pompy ciepła",
      short: "Geo",
      color: "#7a4f2a",
      description: "Wykorzystanie ciepła Ziemi: od płytkich instalacji z pompami ciepła po głęboką geotermię. Formalności zależą od skali, głębokości i sposobu korzystania z wód/zasobów.",
      govPoints: [
        "Geotermia wykorzystuje ciepło wnętrza Ziemi, m.in. wody geotermalne i gruntowe.",
        "Może służyć do ogrzewania, ciepłej wody użytkowej lub produkcji energii elektrycznej w odpowiednich warunkach."
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
        title: "Ścieżka formalna — geotermia / pompy ciepła (szkielet do potwierdzenia)",
        summary: "Wymagania mocno zależą od technologii (gruntowa/powietrzna/wodna/głęboka geotermia). Potwierdź wymagania dla konkretnego przypadku.",
        steps: [
          ozeStep("Dobór technologii i analiza gruntu/zasobu", "Ustal, czy to pompa ciepła, odwierty, wymiennik gruntowy czy głęboka geotermia. Zweryfikuj warunki geologiczne i przestrzeń montażu.", "verify", "Projekt techniczny, warunki geologiczne — do potwierdzenia"),
          ozeStep("Wymagania wodnoprawne/geologiczne", "Dla odwiertów, ujęć wód lub głębokiej geotermii mogą być wymagane decyzje wodnoprawne/geologiczne. Zakres potwierdź przed realizacją.", "verify", "Prawo geologiczne i górnicze / Prawo wodne — do potwierdzenia"),
          ozeStep("Planowanie, budowa i odbiory", "Sprawdź, czy wymagane jest zgłoszenie/pozwolenie budowlane, odbiory instalacji i wymagania producenta.", "verify", "Prawo budowlane, normy, dokumentacja techniczna — do potwierdzenia"),
          ozeStep("Zasilanie elektryczne i sieć", "Potwierdź parametry zasilania, ewentualną zmianę mocy przyłączeniowej i wpływ na instalację elektryczną budynku.", "verify", "Warunki techniczne, OSD, projekt elektryczny — do potwierdzenia"),
          ozeStep("Dotacje/rozliczenia i dokumenty", "Jeśli planowane wsparcie, zweryfikuj wymagania programu (audyt, standard urządzenia, wykonawca, faktury).", "verify", "Program wsparcia / operator programu — do potwierdzenia")
        ],
        sources: [OZE_GOV_SOURCE, OZE_BGK_SOURCE]
      }
    },
    {
      id: "biomasa",
      name: "Biomasa / biogaz / biopłyny",
      short: "Bio",
      color: "#4f7a2f",
      description: "Energia z materii organicznej: biomasa stała, biogaz/biometan i biopłyny. Wymagania zależą od paliwa, technologii, emisji i sposobu wykorzystania energii.",
      govPoints: [
        "Biomasa to materia organiczna wykorzystywana do produkcji ciepła, energii elektrycznej lub paliw.",
        "Biogaz powstaje m.in. w procesie fermentacji; biopłyny to paliwa ciekłe pochodzenia biologicznego."
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
        title: "Ścieżka formalna — biomasa / biogaz / biopłyny (szkielet do potwierdzenia)",
        summary: "Formalności zależą od rodzaju paliwa, mocy, emisji i lokalizacji. Poniżej lista kontrolna do weryfikacji.",
        steps: [
          ozeStep("Identyfikacja technologii i paliwa", "Określ, czy projekt dotyczy kotła na biomasę, biogazowni, biometanu czy biopłynów. Potwierdź parametry paliwa i dostaw.", "verify", "Ustawa OZE, specyfikacja techniczna — do potwierdzenia"),
          ozeStep("Lokalizacja, planowanie i budowa", "Sprawdź MPZP/WZ, wymagania budowlane, przeciwpożarowe i technologiczne dla instalacji.", "verify", "Planowanie przestrzenne / Prawo budowlane / przepisy ppoż. — do potwierdzenia"),
          ozeStep("Emisje i wymagania środowiskowe", "Zweryfikuj wymagania emisyjne, pozwolenia/zgłoszenia środowiskowe, gospodarkę odpadami/popiołem oraz zapach/hałas dla biogazu.", "verify", "Prawo ochrony środowiska, decyzje środowiskowe — do potwierdzenia"),
          ozeStep("Przyłączenie, koncesja/rejestr", "Potwierdź warunki przyłączenia i status: koncesja, rejestr, zwolnienie lub inne obowiązki zależne od mocy i rodzaju działalności.", "verify", "Prawo energetyczne / URE / KOWR / ustawa OZE — do potwierdzenia"),
          ozeStep("Paliwo, jakość i rozliczenia", "Zabezpiecz łańcuch dostaw paliwa, dokumentację jakości, rozliczenia energii/ciepła i obowiązki sprawozdawcze.", "verify", "Umowy, certyfikaty, wymagania programu/rozliczeń — do potwierdzenia")
        ],
        sources: [OZE_GOV_SOURCE, OZE_BGK_SOURCE]
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
    COST_SOURCE_LINE: COST_SOURCE_LINE, MODULE_PRESETS: MODULE_PRESETS, ESTIMATE_DEFAULT: ESTIMATE_DEFAULT,
    STEPS: STEPS, PATHS: PATHS, fmt: fmt, money: money, todayPl: todayPl, calculate: calculate, estimateOptions: estimateOptions, estimate: estimate, optimize: optimize,
    OZE_SOURCES: OZE_SOURCES, OZE_DISCLAIMER: OZE_DISCLAIMER, OZE_GOV_SOURCE: OZE_GOV_SOURCE, OZE_BGK_SOURCE: OZE_BGK_SOURCE,
    ozeById: ozeById, ozeDefaultInput: ozeDefaultInput, ozeCalculate: ozeCalculate,
    COMPARE_DEFAULT: COMPARE_DEFAULT, compareMetrics: compareMetrics,
  };
})(typeof window !== "undefined" ? window : globalThis);
