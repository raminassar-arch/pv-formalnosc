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

  root.PVModel = {
    VERSION: VERSION,
    PLACE_GROUND: PLACE_GROUND,
    PLACE_ROOF: PLACE_ROOF,
    LOC_NORMAL: LOC_NORMAL,
    LOC_PROTECTED: LOC_PROTECTED,
    SOURCE_LINE: SOURCE_LINE,
    DISCLAIMER: DISCLAIMER,
    AUTHOR_LINE: AUTHOR_LINE,
    THRESHOLDS_LINE: THRESHOLDS_LINE,
    STEPS: STEPS,
    PATHS: PATHS,
    fmt: fmt,
    todayPl: todayPl,
    calculate: calculate,
  };
})(typeof window !== "undefined" ? window : globalThis);
