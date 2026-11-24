/* ==========================================================================
   Formalność OZE — wersja web 2.0.0
   app.js — interfejs: routing, formularz, wynik, podgląd i PDF.
   Wszystkie dane pozostają w przeglądarce. Dokumenty powstają lokalnie
   (JS + Canvas), bez drukarki i bez serwera.
   ========================================================================== */
(function () {
  "use strict";

  const M = window.PVModel;
  const P = window.PVPayment;
  // Wersja testowa — wynik, podgląd i PDF dostępne bez opłaty.
  // TEST_MODE = false w js/payment.js przywraca bramkę 30 zł.
  const TEST = !!(P.isTestMode && P.isTestMode());
  const PROJECT_KEY = "pvformalnosc.project.v1";

  let project = null;
  let saveTimer = null;
  let busyCount = 0;
  let toastTimer = null;
  let previewPages = 1;

  // --- pomocnicze ----------------------------------------------------------

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function toast(message, kind) {
    let box = $(".toast");
    if (!box) {
      box = document.createElement("div");
      document.body.appendChild(box);
    }
    box.className = "toast" + (kind ? " " + kind : "");
    box.textContent = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 3600);
  }

  function busyStart() {
    busyCount++;
    if (busyCount > 1) return;
    const el = document.createElement("div");
    el.className = "busy";
    el.id = "busy";
    el.innerHTML = '<div class="box">Przygotowywanie dokumentu…</div>';
    document.body.appendChild(el);
  }

  function busyStop() {
    busyCount = Math.max(0, busyCount - 1);
    if (busyCount === 0) {
      const el = $("#busy");
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
  }

  function download(bytes, filename, mime) {
    const blob = new Blob([bytes], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function stamp() {
    const d = new Date();
    const p = (v) => (v < 10 ? "0" : "") + v;
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  }

  // --- projekt -------------------------------------------------------------

  function emptyProject() {
    return {
      roof: false, protectedArea: false, ha: 1, areaUnit: "ha", kw: 6, powerUnit: "kW",
      est: M.estimateOptions(),
      optMode: "both",
      pdfTheme: window.PVPdf.defaultTheme,
      oze: { source: "wiatr", inputs: {} },
      compare: defaultCompare(),
    };
  }

  function loadProject() {
    const base = emptyProject();
    try {
      const raw = localStorage.getItem(PROJECT_KEY);
      if (!raw) return base;
      const data = JSON.parse(raw);
      return {
        roof: !!data.roof,
        protectedArea: !!data.protectedArea,
        ha: numberOr(data.ha, base.ha),
        areaUnit: data.areaUnit === "m2" ? "m2" : "ha",
        kw: numberOr(data.kw, base.kw),
        powerUnit: data.powerUnit === "W" ? "W" : "kW",
        est: M.estimateOptions(data.est),
        optMode: "both", // dobór z mocy i powierzchni — brak pola do edycji
        pdfTheme: window.PVPdf.themes.some(function (t) { return t.id === data.pdfTheme; })
          ? data.pdfTheme : window.PVPdf.defaultTheme,
        oze: (function(){ var o=Object.assign({source:"wiatr",inputs:{}}, data.oze||{}); if(!M.ozeById(o.source)) o.source="wiatr"; o.inputs=o.inputs||{}; return o; })(),
        compare: Object.assign(defaultCompare(), data.compare || {}),
      };
    } catch (err) { return base; }
  }

  function numberOr(value, fallback) {
    const n = Number(value);
    return isFinite(n) && n >= 0 ? n : fallback;
  }

  function defaultCompare() {
    return { pricePlnMwh: 800, pvYieldKwhKwYear: 1050, pvOpexPctYear: 1.5 };
  }

  function saveProject() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(PROJECT_KEY, JSON.stringify(project)); }
      catch (err) { /* brak pamięci — dane zostają w bieżącej sesji */ }
    }, 250);
  }

  function placeText() { return project.roof ? M.PLACE_ROOF : M.PLACE_GROUND; }
  function locationText() { return project.protectedArea ? M.LOC_PROTECTED : M.LOC_NORMAL; }

  function currentResult() {
    return M.calculate(project.roof, project.protectedArea, project.ha, project.kw,
                       placeText(), locationText());
  }

  function currentEstimate() {
    const opt = currentOptimizer();
    const panels = opt.recommended ? opt.recommended.panels : undefined;
    return M.estimate(project.ha, project.kw, project.est, panels);
  }

  function currentOptimizer() {
    return M.optimize(project.optMode, project.ha, project.kw, project.est);
  }

  function currentPdfTheme() { return project.pdfTheme; }

  function previewPalette() {
    return window.PVPdf.themePalette(currentPdfTheme());
  }

  // --- routing -------------------------------------------------------------


  function route() {
    const hash = (location.hash || "#/start").replace(/^#\/?/, "");
    const parts = hash.split("/").filter(Boolean);
    return parts.length ? parts : ["start"];
  }

  function go(path) {
    const target = "#/" + path;
    if (location.hash === target) render();
    else location.hash = target;
  }

  const STEPS = [
    ["start", "Start", "Wprowadzenie"],
    ["pv", "Fotowoltaika", "PV — kalkulator i wynik"],
    ["wiatr", "Wiatr", "Energetyka wiatrowa"],
    ["woda", "Woda", "Energetyka wodna"],
    ["geotermia", "Geotermia", "Ciepło Ziemi / pompy ciepła"],
    ["biomasa", "BIO", "Biogaz / biopłyny"],
    ["porownaj", "Porównaj", "Opłacalność wariantów OZE"],
  ];
  const OZE_TAB_IDS = ["wiatr","woda","geotermia","biomasa"];
  const TITLES = {start:"Start",pv:"Fotowoltaika",wiatr:"Wiatr",woda:"Woda",geotermia:"Geotermia",biomasa:"BIO",porownaj:"Porównaj OZE"};

  function renderSteps(head) {
    const box = $("#steps");
    if (!box) return;
    box.innerHTML = STEPS.map(function (s) {
      const active = s[0] === head;
      return '<a class="step' + (active ? " active" : "") + '" href="#/' + s[0] + '">' +
        "<span>" + esc(s[1]) + "</span><small>" + esc(s[2]) + "</small></a>";
    }).join("");
  }

  function card(title, body) {
    return '<article class="card"><h3>' + esc(title) + '</h3><p>' + esc(body) + '</p></article>';
  }

  // --- widoki --------------------------------------------------------------

  const START_ICONS = {
    pv: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="12" cy="11" r="5" fill="currentColor" stroke="none"/><path d="M12 2v3M12 17v3M3 11h3M18 11h3M6 5l2 2M16 15l2 2M18 4l-2 2M8 15l-2 2"/><path d="M20 23h25l-3 17H17z"/><path d="M25 23l-2 17M32 23l-1 17M39 23l1 17M19 29h27M18 35h29"/></svg>',
    wiatr: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 20v23M17 43h14"/><circle cx="24" cy="17" r="2.5" fill="currentColor" stroke="none"/><path d="M24 14V3M26 18l10 7M22 18l-10 7"/><path d="M20 5c2-2 5-2 7 0M34 24c2 1 3 3 3 5M14 24c-2 1-3 3-3 5"/></svg>',
    woda: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4c7 9 12 15 12 21a12 12 0 0 1-24 0c0-6 5-12 12-21z"/><path d="M13 31c3-2 5 2 8 0s5 2 8 0 4-1 6-2"/><path d="M15 37c3-2 5 2 8 0s5 2 8 0"/></svg>',
    geotermia: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M19 7a5 5 0 0 1 10 0v18a7 7 0 1 1-10 0z"/><circle cx="24" cy="33" r="4" fill="currentColor" stroke="none"/><path d="M9 41h30M12 45h24"/><path d="M7 12c2-2 4-2 6 0M35 12c2-2 4-2 6 0"/></svg>',
    biomasa: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M39 7C23 7 12 14 12 26c0 7 5 12 12 12 12 0 19-11 15-31z"/><path d="M14 36c8-5 15-12 21-24"/><path d="M24 43c-4-3-5-7-2-11 1 3 3 4 4 4 0-4 3-6 4-8 2 5 2 11-2 15z" fill="currentColor" stroke="none"/></svg>',
    porownaj: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 41h32"/><rect x="10" y="23" width="7" height="18" rx="1.5"/><rect x="20" y="15" width="7" height="26" rx="1.5"/><rect x="30" y="28" width="7" height="13" rx="1.5"/><path d="M11 15l8-8 7 5 10-10"/></svg>'
  };

  function startIcon(id) {
    return START_ICONS[id] || START_ICONS.pv;
  }

  function viewStart() {
    const tabs = [
      {id:"pv", name:"Fotowoltaika", desc:"Kalkulator mocy/powierzchni, dobór modułów, wycena, optymalizator, ścieżka formalna, podgląd A4 i PDF."},
      {id:"wiatr", name:"Energetyka wiatrowa", desc:"Kalkulator orientacyjny (moc, wiatr, Cp), energia roczna i CAPEX/OPEX."},
      {id:"woda", name:"Energetyka wodna", desc:"Kalkulator orientacyjny (przepływ, spadek, sprawność) i energia roczna."},
      {id:"geotermia", name:"Geotermia / pompy ciepła", desc:"Kalkulator orientacyjny (zapotrzebowanie, COP), koszt energii i CAPEX/OPEX."},
      {id:"biomasa", name:"BIO", desc:"Kalkulator orientacyjny (paliwo, wartość opałowa, sprawność) i energia."},
      {id:"porownaj", name:"Porównaj warianty", desc:"Orientacyjna opłacalność: energia, CAPEX/OPEX, przychód i prosty okres zwrotu."}
    ];
    const tabCards = tabs.map(function(t){
      return '<button type="button" class="start-tab-card" data-act="go" data-path="' + esc(t.id) + '"' +
        ' aria-label="Przejdź do zakładki ' + esc(t.name) + '" title="' + esc(t.name) + '">' +
        '<span class="start-tab-icon">' + startIcon(t.id) + '</span>' +
        '<h3>' + esc(t.name) + '</h3><p>' + esc(t.desc) + '</p>' +
        '</button>';
    }).join("");
    return '<section class="hero">' +
      '<div class="hero-text">' +
      '<h1>Formalność OZE</h1>' +
      '<p class="lead">Aplikacja do wstępnej oceny formalności i parametrów dla odnawialnych źródeł energii. Każda technologia ma osobną zakładkę z kalkulatorem, checklistą formalną, podglądem i eksportem PDF.</p>' +
      '<section class="hero-contents" aria-labelledby="hero-contents-title">' +
      '<h2 id="hero-contents-title">Co zawiera program</h2>' +
      '<ol class="contents-list">' +
      '<li>5 osobnych zakładek technologii OZE</li>' +
      '<li>Zakładka Porównaj: opłacalność wariantów</li>' +
      '<li>Kalkulatory orientacyjne</li>' +
      '<li>Checklisty KPK gov.pl</li>' +
      '<li>Podgląd A4 i eksport PDF</li>' +
      '</ol></section>' +
      '</div></section>' +
      '<section class="panel"><h2>Zakładki w programie</h2><p class="muted">Wybierz technologię — wynik, podgląd i PDF znajdują się na dole każdej zakładki.</p>' +
      '<div class="start-tab-grid">' + tabCards + '</div></section>' +
      '<section class="panel"><h2>Jak korzystać</h2><ol class="plain-ol">' +
      '<li><strong>Wybierz zakładkę</strong> technologii OZE.</li>' +
      '<li><strong>Uzupełnij dane</strong> w kalkulatorze orientacyjnym.</li>' +
      '<li><strong>Sprawdź wynik</strong> i checklistę formalną na dole zakładki.</li>' +
      '<li><strong>Pobierz PDF</strong> z podglądem A4 i watermarkiem wersji testowej.</li>' +
      '</ol><div class="note warn"><strong>Uwaga:</strong> Wyniki mają charakter orientacyjny. Wymagania formalne zależą od lokalizacji, skali i aktualnych przepisów — potwierdź je w źródłach urzędowych.</div></section>';
  }

  function ozeInput(sourceId) {
    const src = M.ozeById(sourceId);
    const saved = (project.oze && project.oze.inputs && project.oze.inputs[sourceId]) || {};
    return Object.assign(M.ozeDefaultInput(sourceId), saved);
  }
  function readOzeForm(sourceId) {
    let sid = sourceId;
    if (!sid) {
      const head = normalizeRoute(route()[0]);
      if (OZE_TAB_IDS.indexOf(head) >= 0) sid = head;
    }
    const src = M.ozeById(sid);
    if (!src || OZE_TAB_IDS.indexOf(src.id) < 0) return;
    if (!src.calculator || !src.calculator.fields) return;
    const inp = Object.assign({}, ozeInput(src.id));
    src.calculator.fields.forEach(function (f) {
      const el = document.getElementById("oze-" + src.id + "-" + f.key);
      if (el) inp[f.key] = numberOr(el.value, inp[f.key]);
    });
    project.oze.inputs[src.id] = inp;
    saveProject();
  }

  function renderOzeResult(src) {
    if (!src.calculator || src.calculator.kind === "link") return "";
    const input = ozeInput(src.id);
    const r = M.ozeCalculate(src.id, input) || {};
    let rows = [];
    if (src.id === "wiatr") {
      rows = [["Moc z wiatru (orient.)", M.fmt(r.powerFromWindKw) + " kW"], ["Energia roczna", M.fmt(r.energyMwhYear) + " MWh/rok"], ["Powierzchnia wirnika", M.fmt(r.areaM2) + " m²"], ["CAPEX orient.", M.money(r.capexPln)], ["OPEX roczny orient.", M.money(r.opexPlnYear)]];
    } else if (src.id === "woda") {
      rows = [["Moc elektryczna (orient.)", M.fmt(r.powerKw) + " kW"], ["Energia roczna", M.fmt(r.energyMwhYear) + " MWh/rok"], ["Przepływ", M.fmt(r.flowM3s) + " m³/s"], ["CAPEX orient.", M.money(r.capexPln)], ["OPEX roczny orient.", M.money(r.opexPlnYear)]];
    } else if (src.id === "geotermia") {
      rows = [["Ciepło roczne", M.fmt(r.heatMwhYear) + " MWh/rok"], ["Energia el. do napędu", M.fmt(r.electricityMwhYear) + " MWh/rok"], ["Koszt energii el.", M.money(r.electricityCostPlnYear) + "/rok"], ["CAPEX orient.", M.money(r.capexPln)], ["OPEX roczny orient.", M.money(r.opexPlnYear)]];
    } else if (src.id === "biomasa") {
      rows = [["Energia użyteczna", M.fmt(r.energyMwhYear) + " MWh/rok"], ["Średnia moc", M.fmt(r.avgPowerKw) + " kW"], ["Koszt paliwa", M.money(r.fuelCostPlnYear) + "/rok"], ["CAPEX orient.", M.money(r.capexPln)], ["OPEX roczny orient.", M.money(r.opexPlnYear)]];
    }
    return '<div class="oze-result" id="oze-result-' + esc(src.id) + '">' +
      '<div class="kpi-row">' + rows.slice(0,3).map(function (x) { return '<div class="kpi"><span>' + esc(x[0]) + '</span><strong>' + esc(x[1]) + '</strong></div>'; }).join("") + '</div>' +
      '<table class="data-table"><tbody>' + rows.map(function (x) { return '<tr><th>' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td></tr>'; }).join("") + '</tbody></table>' +
      '<div class="note warn"><strong>Założenia orientacyjne:</strong><ul>' + (r.assumptions||[]).map(function(a){return '<li>'+esc(a)+'</li>';}).join("") + '</ul></div>' +
      '</div>';
  }

  function ozeStepList(src) {
    return (src.formalPath.steps || []).map(function (st, i) {
      return '<div class="step-card"><div class="step-no">' + (i+1) + '</div><div class="step-body"><h4>' +
        esc(st.name) + '</h4><p>' + esc(st.desc) + '</p></div></div>';
    }).join("");
  }

  function viewOzeSource(sourceId) {
    const src = M.ozeById(sourceId);
    const input = ozeInput(src.id);
    const govPoints = (src.govPoints || []).map(function (g) { return '<li>' + esc(g) + '</li>'; }).join("");
    const fields = (src.calculator.fields || []).map(function (f) {
      const val = input[f.key];
      return '<div class="field"><label class="field-label" for="oze-' + esc(src.id) + '-' + esc(f.key) + '">' + esc(f.label) + '</label>' +
        '<input id="oze-' + esc(src.id) + '-' + esc(f.key) + '" type="number" inputmode="decimal" step="' + esc(String(f.step||0.1)) + '" min="' + esc(String(f.min==null?0:f.min)) + '"' + (f.max!=null?' max="'+esc(String(f.max))+'"':'') + ' value="' + esc(String(val==null?"":val)) + '">' +
        '</div>';
    }).join("");
    return '<div class="page-head"><div><h1>' + esc(src.name) + '</h1><p>' + esc(src.description) + '</p></div></div>' +
      '<section class="panel"><div class="note"><strong>Zakres wg gov.pl (opisowo):</strong><ul>' + govPoints + '</ul></div>' +
      '<div class="note warn"><strong>Ważne:</strong> ' + esc(M.OZE_DISCLAIMER) + '</div></section>' +
      '<section class="panel"><h3>Kalkulator orientacyjny</h3><div class="form-grid oze-grid">' + fields + '</div>' +
      '<div class="row-actions"><button class="btn primary" data-act="oze-calc" data-source="' + esc(src.id) + '">Wynik</button>' +
      '<button class="btn ghost" data-act="oze-reset" data-source="' + esc(src.id) + '">Przywróć domyślne</button></div></section>' +
      '<section class="panel"><h2>Wynik — ' + esc(src.name) + '</h2>' + renderOzeResult(src) + '</section>' +
      '<section class="panel"><h3>' + esc(src.formalPath.title) + '</h3><p>' + esc(src.formalPath.summary) + '</p>' +
      '<div class="step-list">' + ozeStepList(src) + '</div></section>' +
      '<section class="panel"><h2>Podgląd i PDF</h2><p class="small muted">Podgląd dokumentu A4 i eksport PDF dla tej zakładki — 5 stylów do wyboru.</p>' +
      '<div class="row-actions">' + themePicker() +
      '<button class="btn primary" data-act="oze-pdf" data-source="' + esc(src.id) + '">Pobierz PDF</button>' +
      '<button class="btn" data-act="oze-preview" data-source="' + esc(src.id) + '">Odśwież podgląd</button></div>' +
      '<div class="preview-wrap"><div class="paper"><canvas id="preview-canvas" width="2480" height="3508"></canvas></div></div></section>';
  }

  function numField(id, label, value, step, hint) {
    return '<div class="field"><label class="field-label" for="' + esc(id) + '">' + esc(label) + "</label>" +
      '<input type="number" id="' + id + '" min="0" step="' + step + '" value="' +
      esc(String(Number(value || 0))) + '">' +
      (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + "</div>";
  }

  function verdictBox(need, title, desc) {
    return '<div class="verdict' + (need ? " need" : "") + '">' +
      "<h3>" + esc(title) + "</h3>" +
      '<div class="mark">' + (need ? "TAK" : "NIE") + "</div>" +
      "<p>" + esc(desc) + "</p></div>";
  }

  /** Wybór stylu dotyczy zarówno podglądu A4, jak i pobieranego PDF. */
  function themePicker() {
    return '<label class="theme-pick"><span>Styl raportu</span>' +
      '<select id="f-pdf-theme">' +
      window.PVPdf.themes.map(function (t) {
        return '<option value="' + esc(t.id) + '"' +
          (t.id === project.pdfTheme ? " selected" : "") + ">" +
          esc(t.label || t.name) + "</option>";
      }).join("") +
      "</select></label>";
  }

  function stat(k, v) {
    return '<div class="stat"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + "</span></div>";
  }

  function estimatePanel(e) {
    const row = (k, v, total) =>
      '<div class="stat' + (total ? " total" : "") + '"><span class="k">' + esc(k) +
      '</span><span class="v">' + esc(v) + "</span></div>";
    return '<section class="panel est-panel"><h2>Wycena i czas realizacji</h2>' +
      '<p class="small muted">' + esc(e.presetName) + " · " + esc(e.powerNote) + "</p>" +
      '<div class="est-grid">' +
      row("Liczba paneli", e.panels + " szt.") +
      row("Powierzchnia użyteczna", M.fmt(e.usableAreaM2) + " m²") +
      row("Moc z liczby paneli", M.fmt(e.installedKw) + " kW") +
      row("Koszt modułów", M.money(e.moduleZl)) +
      row("Konstrukcja, falownik, osprzęt", M.money(e.bosZl)) +
      row("Koszt materiałów", M.money(e.materialZl)) +
      row("Koszt wykonania (robocizna)", M.money(e.laborZl)) +
      row("RAZEM", M.money(e.totalZl), true) +
      row("Czas realizacji", e.days + " dni roboczych") +
      row("Koszt na panel", M.money(e.perPanelZl)) +
      "</div>" +
      '<p class="small muted">Przyjęte tempo: ' + e.panelsPerDay +
      " paneli/dzień. " + esc(M.COST_SOURCE_LINE) + "</p></section>";
  }

  function optimizerPanel(o) {
    const head = '<section class="panel opt-panel"><h2>Najtańszy wariant — dobór modułu i mocy</h2>' +
      '<p class="small muted">' + esc(o.note) + "</p>";
    const rec = o.recommended;
    if (!rec) return head + "</section>";
    const diff = rec.totalZl - (o.cheapest ? o.cheapest.totalZl : 0);
    const rows = o.list.map(function (x) {
      const best = x.id === rec.id;
      const areaCell = o.mode === "both"
        ? esc(M.fmt(x.neededHa)) + " ha" +
          '<span class="cell-sub">moc ' + x.powerPanels + " · pow. " + x.areaPanels + "</span>"
        : o.mode === "power"
          ? (x.fitsArea ? esc(M.fmt(x.neededHa)) + " ha" : "nie mieści się")
          : esc(M.fmt(x.neededM2)) + " m²";
      return "<tr" + (best ? ' class="best"' : "") + "><td>" +
        (best ? "★ " : "") + esc(x.name) + " · " + esc(M.fmt(x.wp)) + " Wp</td>" +
        "<td>" + x.panels + " szt.</td>" +
        "<td>" + esc(M.fmt(x.installedKw)) + " kW</td>" +
        "<td>" + areaCell + "</td>" +
        "<td>" + esc(M.money(x.totalZl)) + "</td></tr>";
    }).join("");
    return head +
      '<div class="est-grid">' +
      stat("Rekomendacja", rec.name) +
      stat("Wybrano", rec.panels + " szt.") +
      stat("Z mocy", rec.powerPanels + " szt.") +
      stat("Z powierzchni", rec.areaPanels + " szt.") +
      stat("Moc z paneli", M.fmt(rec.installedKw) + " kW") +
      stat("Koszt całkowity", M.money(rec.totalZl)) +
      stat("Dopłata vs najtańszy", diff > 0 ? M.money(diff) : "najtańszy wariant") +
      stat("Czas realizacji", rec.days + " dni roboczych") +
      "</div>" +
      '<div class="opt-table-wrap"><table class="opt-table"><thead><tr>' +
      "<th>Moduł</th><th>Panele</th><th>Moc</th><th>" +
      (o.mode === "both" ? "Pow. (ha) · szt. z mocy/pow."
        : o.mode === "power" ? "Wymagana powierzchnia" : "Zajęta powierzchnia") +
      "</th><th>Razem</th></tr></thead><tbody>" + rows +
      "</tbody></table></div></section>";
  }

  function viewPv() {
    const r = currentResult();
    const e = currentEstimate();
    const o = currentOptimizer();
    return '<div class="page-head"><div><h1>Fotowoltaika</h1><p>Parametry, wynik formalny, wycena, optymalizator, podgląd A4 i PDF.</p></div></div>' +
      viewDaneBody() +
      '<section class="panel"><div class="grid">' +
      '<div class="field"><span class="field-label">Miejsce montażu</span><span>' + esc(r.place_text) + "</span></div>" +
      '<div class="field"><span class="field-label">Lokalizacja</span><span>' + esc(r.location_text) + "</span></div>" +
      '<div class="field"><span class="field-label">Powierzchnia</span><span>' +
      esc(M.fmt(Math.round(r.ha * 10000 * 100) / 100)) + " m² (" + esc(M.fmt(r.ha)) + " ha)</span></div>" +
      '<div class="field"><span class="field-label">Moc</span><span>' + esc(M.fmt(r.kw)) + " kW (" +
      esc(M.fmt(Math.round(r.kw * 1000))) + " W)</span></div>" +
      "</div></section>" +
      '<section class="panel" id="pv-wynik"><div class="verdict-grid">' +
      verdictBox(r.env, "Decyzja środowiskowa", r.env_desc) +
      verdictBox(r.perm, "Pozwolenie na budowę", r.perm_desc) +
      "</div></section>" +
      '<section class="panel"><div class="path-card"><h2>Ścieżka ' + r.path_no +
      ": " + esc(r.path_name) + "</h2><p>" + esc(r.path_meta) + "</p></div></section>" +
      (r.warning ? '<section class="notice">' + esc(r.warning) + "</section>" : "") +
      '<section class="panel"><h2>Kroki w kolejności</h2><ol class="steps-list">' +
      r.steps.map(function (s, i) {
        return "<li><span class=\"num\">" + (i + 1) + "</span><strong>" + esc(s.name) +
          "</strong><p>" + esc(s.desc) + "</p></li>";
      }).join("") +
      "</ol></section>" +
      estimatePanel(e) +
      optimizerPanel(o) +
      '<section class="panel"><h2>Podgląd i PDF</h2><p class="small muted">Podgląd dokumentu A4 (300 DPI) i eksport PDF — 5 stylów do wyboru.</p>' +
      '<div class="row-actions">' + themePicker() +
      '<button class="btn primary" data-act="pdf">Pobierz PDF</button>' +
      '<button class="btn" data-act="pv-preview">Odśwież podgląd</button></div>' +
      '<div class="preview-wrap"><div class="paper"><canvas id="preview-canvas" width="2480" height="3508"></canvas></div></div></section>' +
      '<section class="panel footnote"><p>' + esc(M.SOURCE_LINE) + "</p>" +
      "<p>" + esc(M.DISCLAIMER) + "</p><p>" + esc(M.AUTHOR_LINE) + "</p></section>";
  }

  function viewDaneBody() {
    const p = project;
    const inM2 = p.areaUnit === "m2";
    const unitField = '<div class="field"><label class="field-label" for="f-area-unit">Jednostka powierzchni</label>' +
      '<select id="f-area-unit">' +
      '<option value="ha"' + (inM2 ? "" : " selected") + ">hektary (ha)</option>" +
      '<option value="m2"' + (inM2 ? " selected" : "") + ">metry kwadratowe (m²)</option>" +
      '</select><span class="hint">1 ha = 10 000 m².</span></div>';
    const areaValue = inM2 ? Math.round(p.ha * 10000 * 100) / 100 : p.ha;
    const inW = p.powerUnit === "W";
    const powerUnitField = '<div class="field"><label class="field-label" for="f-power-unit">Jednostka mocy</label>' +
      '<select id="f-power-unit">' +
      '<option value="kW"' + (inW ? "" : " selected") + ">kilowaty (kW)</option>" +
      '<option value="W"' + (inW ? " selected" : "") + ">waty (W)</option>" +
      '</select><span class="hint">1 kW = 1000 W.</span></div>';
    const powerValue = inW ? Math.round(p.kw * 1000 * 100) / 100 : p.kw;
    return '<section class="panel"><h2>Dane instalacji</h2><div class="grid">' +
      '<div class="field wide"><label class="field-label" for="f-place">Miejsce montażu</label>' +
      '<select id="f-place">' +
      '<option value="ground"' + (p.roof ? "" : " selected") + ">" +
      esc(M.PLACE_GROUND) + "</option>" +
      '<option value="roof"' + (p.roof ? " selected" : "") + ">" +
      esc(M.PLACE_ROOF) + "</option></select></div>" +
      '<div class="field wide"><span class="field-label">Lokalizacja</span>' +
      '<label class="checkline"><input type="checkbox" id="f-protected"' +
      (p.protectedArea ? " checked" : "") + "><span>" + esc(M.LOC_PROTECTED) +
      ' <small class="muted">(próg 0,5 ha zamiast 2 ha)</small></span></label></div>' +
      unitField +
      numField(inM2 ? "f-m2" : "f-ha", inM2 ? "Powierzchnia (m²)" : "Powierzchnia (ha)",
        areaValue, inM2 ? "100" : "0.01", "Po obrysie zewnętrznych modułów — podstawa doboru paneli.") +
      powerUnitField +
      numField(inW ? "f-w" : "f-kw", inW ? "Moc deklarowana (W)" : "Moc deklarowana (kW)",
        powerValue, inW ? "1" : "0.1") +
      "</div>" +
      '<p class="small muted panel-note">Liczba paneli jest dobierana z mocy i powierzchni.</p>' +
      '<div class="row-actions"><button class="btn primary" data-act="pv-scroll-result">Wynik</button>' +
      '<button class="btn ghost" data-act="reset">Wyczyść formularz</button></div>' +
      '<p class="small muted">' + esc(M.THRESHOLDS_LINE) + "</p></section>";
  }

  // --- render --------------------------------------------------------------

  function replaceHash(path) {
    const target = "#/" + path;
    try {
      if (location.hash === target) { render(); return; }
      history.replaceState(null, "", target);
    } catch (err) { location.replace(target); return; }
    render();
  }

  function normalizeRoute(head) {
    if (head === "dane" || head === "wynik" || head === "podglad" || head === "platnosc" || head === "eksport") return "pv";
    if (head === "oze") return project && project.oze && project.oze.source && OZE_TAB_IDS.indexOf(project.oze.source)>=0 ? project.oze.source : "wiatr";
    if (head === "porownanie" || head === "porownywarka") return "porownaj";
    if (head === "o-programie") return "start";
    if (STEPS.some(function(s){return s[0]===head;})) return head;
    return "start";
  }

  function compareInputs() {
    const c = project.compare || {};
    return {
      pricePlnMwh: Math.max(0, Number(c.pricePlnMwh != null ? c.pricePlnMwh : 800)),
      pvYieldKwhKwYear: Math.max(0, Number(c.pvYieldKwhKwYear != null ? c.pvYieldKwhKwYear : 1050)),
      pvOpexPctYear: Math.max(0, Number(c.pvOpexPctYear != null ? c.pvOpexPctYear : 1.5))
    };
  }

  function collectCompareRows() {
    const cmp = compareInputs();
    const rows = [];
    const pvEst = currentEstimate();
    const pvMwh = (pvEst.installedKw * cmp.pvYieldKwhKwYear) / 1000;
    const pvCapex = pvEst.totalZl || 0;
    const pvOpex = pvCapex * (cmp.pvOpexPctYear / 100);
    const pvCalc = { energyMwhYear: pvMwh, capexPln: pvCapex, opexPlnYear: pvOpex };
    const pvMetric = M.compareMetrics("pv", pvCalc, {}, cmp);
    rows.push(Object.assign({ id: "pv", name: "Fotowoltaika (PV)", detail: M.fmt(pvEst.installedKw) + " kW, uzysk " + M.fmt(cmp.pvYieldKwhKwYear) + " kWh/kWp/rok" }, pvMetric));

    OZE_TAB_IDS.forEach(function (id) {
      const src = M.ozeById(id);
      const input = ozeInput(id);
      const calc = M.ozeCalculate(id, input) || {};
      const metric = M.compareMetrics(id, calc, input, cmp);
      let detail = "";
      if (id === "wiatr") detail = M.fmt(input.powerKw) + " kW, wiatr " + M.fmt(input.windMs) + " m/s";
      else if (id === "woda") detail = M.fmt(input.flowLps) + " l/s, spadek " + M.fmt(input.headM) + " m";
      else if (id === "geotermia") detail = M.fmt(input.heatDemandKw) + " kW ciepła, COP " + M.fmt(input.cop);
      else if (id === "biomasa") detail = M.fmt(input.fuelTonsYear) + " t/rok, " + M.fmt(input.gcvKwhKg) + " kWh/kg";
      rows.push(Object.assign({ id: id, name: src.name, detail: detail }, metric));
    });

    rows.forEach(function (r) { r.recommended = false; });
    const ranked = rows.filter(function(r){ return r.paybackYears != null && isFinite(r.paybackYears) && r.paybackYears > 0; }).sort(function(a,b){ return a.paybackYears - b.paybackYears; });
    if (ranked.length) ranked[0].recommended = true;
    return rows;
  }

  function readCompareForm() {
    const price = document.getElementById("cmp-price");
    const pvYield = document.getElementById("cmp-pv-yield");
    const pvOpex = document.getElementById("cmp-pv-opex");
    if (!project.compare) project.compare = defaultCompare();
    if (price) project.compare.pricePlnMwh = Math.max(0, numberOr(price.value, project.compare.pricePlnMwh));
    if (pvYield) project.compare.pvYieldKwhKwYear = Math.max(0, numberOr(pvYield.value, project.compare.pvYieldKwhKwYear));
    if (pvOpex) project.compare.pvOpexPctYear = Math.max(0, numberOr(pvOpex.value, project.compare.pvOpexPctYear));
    saveProject();
  }

  function viewCompare() {
    const cmp = compareInputs();
    const rows = collectCompareRows();
    const best = rows.find(function(r){ return r.recommended; });
    const tableRows = rows.map(function (r) {
      const payback = M.fmtPayback(r.paybackYears);
      const rec = r.recommended ? '<span class="badge ok">Najkorzystniejszy</span>' : "";
      const netCls = r.netPlnYear >= 0 ? "ok" : "warn";
      return '<tr' + (r.recommended ? ' class="compare-best"' : '') + '>' +
        '<td><strong>' + esc(r.name) + '</strong> ' + rec + '<div class="small muted">' + esc(r.detail) + '</div></td>' +
        '<td>' + esc(M.fmt(r.energyMwhYear)) + ' MWh/rok<div class="small muted">' + esc(r.label) + '</div></td>' +
        '<td>' + esc(M.money(r.capexPln)) + '</td>' +
        '<td>' + esc(M.money(r.opexPlnYear)) + '/rok</td>' +
        '<td>' + esc(M.money(r.revenuePlnYear)) + '/rok</td>' +
        '<td><span class="badge ' + netCls + '">' + esc(M.money(r.netPlnYear)) + '/rok</span></td>' +
        '<td><strong>' + esc(payback) + '</strong></td>' +
        '</tr>';
    }).join("");

    const bestBox = best
      ? '<div class="note ok"><strong>Najkorzystniejszy wariant (orientacyjnie):</strong> ' + esc(best.name) +
        '. Prosty okres zwrotu: <strong>' + esc(M.fmtPayback(best.paybackYears)) + '</strong>, bilans roczny: <strong>' + esc(M.money(best.netPlnYear)) + '</strong>. ' +
        'Wynik zależy od założeń ceny energii, CAPEX/OPEX i danych wpisanych w zakładkach.</div>'
      : '<div class="note warn"><strong>Brak jednoznacznie opłacalnego wariantu</strong> przy bieżących założeniach. Sprawdź cenę energii, CAPEX/OPEX lub dane wejściowe w zakładkach.</div>';

    return '<div class="page-head"><div><h1>Porównaj warianty OZE</h1><p>Porównanie orientacyjne na podstawie aktualnych danych z zakładek: Fotowoltaika, Wiatr, Woda, Geotermia i BIO.</p></div></div>' +
      '<section class="panel"><h3>Założenia porównania</h3><p class="small muted">To porównanie uproszczone. Nie zastępuje audytu energetycznego, analizy finansowej ani studium wykonalności.</p>' +
      '<div class="form-grid oze-grid">' +
      '<div class="field"><label class="field-label" for="cmp-price">Cena energii / wartość energii [zł/MWh]</label><input id="cmp-price" type="number" min="0" step="10" value="' + esc(String(cmp.pricePlnMwh)) + '"></div>' +
      '<div class="field"><label class="field-label" for="cmp-pv-yield">PV: uzysk jednostkowy [kWh/kWp/rok]</label><input id="cmp-pv-yield" type="number" min="0" step="10" value="' + esc(String(cmp.pvYieldKwhKwYear)) + '"></div>' +
      '<div class="field"><label class="field-label" for="cmp-pv-opex">PV: OPEX roczny [% CAPEX]</label><input id="cmp-pv-opex" type="number" min="0" step="0.1" value="' + esc(String(cmp.pvOpexPctYear)) + '"></div>' +
      '</div>' +
      '<div class="row-actions"><button class="btn primary" data-act="cmp-calc">Wynik</button>' +
      '<button class="btn ghost" data-act="cmp-reset">Przywróć domyślne</button></div></section>' +
      '<section class="panel"><h2>Wynik porównania</h2>' + bestBox +
      '<div class="table-wrap"><table class="data-table compare-table"><thead><tr>' +
      '<th>Wariant</th><th>Energia roczna</th><th>CAPEX</th><th>OPEX + paliwo/el.</th><th>Przychód/wartość</th><th>Bilans roczny</th><th>Prosty zwrot</th>' +
      '</tr></thead><tbody>' + tableRows + '</tbody></table></div>' +
      '<div class="note warn"><strong>Metoda:</strong> Przychód/wartość = energia roczna × cena energii. Bilans roczny = przychód/wartość − OPEX (dla geotermii doliczono koszt energii elektrycznej, dla biomasy koszt paliwa). Prosty zwrot = CAPEX / bilans roczny; gdy bilans ≤ 0, zwrot nie występuje. PV korzysta z mocy z zakładki Fotowoltaika i podanego uzysku kWh/kWp/rok.</div></section>' +
      '<section class="panel"><h2>Podgląd i PDF</h2><p class="small muted">Podgląd A4 i eksport porównania do PDF — 5 stylów do wyboru.</p>' +
      '<div class="row-actions">' + themePicker() +
      '<button class="btn primary" data-act="cmp-pdf">Pobierz PDF porównania</button>' +
      '<button class="btn" data-act="cmp-preview">Odśwież podgląd</button></div>' +
      '<div class="preview-wrap"><div class="paper"><canvas id="preview-canvas" width="2480" height="3508"></canvas></div></div></section>';
  }

  function render() {
    if (!project) project = loadProject();
    let head = normalizeRoute(route()[0]);
    if (OZE_TAB_IDS.indexOf(head) >= 0) { project.oze.source = head; saveProject(); }
    let html = "";
    if (head === "pv") html = viewPv();
    else if (head === "porownaj") html = viewCompare();
    else if (OZE_TAB_IDS.indexOf(head) >= 0) html = viewOzeSource(head);
    else { head = "start"; html = viewStart(); }

    const view = $("#view");
    if (view) view.innerHTML = html;
    renderSteps(head);
    document.title = (TITLES[head] || "Start") + " – Formalność OZE " + M.VERSION;

    if (head === "pv") initPvPreview().catch(function (err) { console.warn(err); });
    if (head === "porownaj") initComparePreview().catch(function (err) { console.warn(err); });
    if (OZE_TAB_IDS.indexOf(head) >= 0) initOzePreview(head).catch(function (err) { console.warn(err); });
  }

  async function initPvPreview() {
    const canvas = $("#preview-canvas");
    if (!canvas) return;
    previewPages = await window.PVPdf.renderPreview(
      currentResult(), canvas, currentEstimate(), currentOptimizer(), currentPdfTheme());
  }

  async function initOzePreview(sourceId) {
    const canvas = $("#preview-canvas");
    if (!canvas) return;
    const src = M.ozeById(sourceId);
    await renderOzePdfPreview(src, canvas);
  }

  async function doPdf() {
    busyStart();
    try {
      const bytes = await window.PVPdf.renderPdf(
        currentResult(), currentEstimate(), currentOptimizer(), currentPdfTheme());
      download(bytes, "Formalnosc_OZE_PV_" + stamp() + ".pdf", "application/pdf");
      toast("PDF 300 DPI pobrany.", "ok");
    } catch (err) {
      toast("Nie udało się utworzyć PDF: " + err.message, "err");
    } finally { busyStop(); }
  }

  async function doOzePdf(sourceId) {
    busyStart();
    try {
      const src = M.ozeById(sourceId);
      const bytes = await renderOzePdf(src);
      download(bytes, "Formalnosc_OZE_" + src.id + "_" + stamp() + ".pdf", "application/pdf");
      toast("PDF 300 DPI pobrany.", "ok");
    } catch (err) {
      toast("Nie udało się utworzyć PDF: " + err.message, "err");
    } finally { busyStop(); }
  }


  function ozeReportRows(src) {
    const input = ozeInput(src.id);
    const r = M.ozeCalculate(src.id, input) || {};
    let rows = [];
    if (src.id === "wiatr") rows = [["Moc z wiatru (orient.)", M.fmt(r.powerFromWindKw) + " kW"],["Energia roczna", M.fmt(r.energyMwhYear) + " MWh/rok"],["Powierzchnia wirnika", M.fmt(r.areaM2) + " m²"],["CAPEX orient.", M.money(r.capexPln)],["OPEX roczny orient.", M.money(r.opexPlnYear)]];
    else if (src.id === "woda") rows = [["Moc elektryczna (orient.)", M.fmt(r.powerKw) + " kW"],["Energia roczna", M.fmt(r.energyMwhYear) + " MWh/rok"],["Przepływ", M.fmt(r.flowM3s) + " m³/s"],["CAPEX orient.", M.money(r.capexPln)],["OPEX roczny orient.", M.money(r.opexPlnYear)]];
    else if (src.id === "geotermia") rows = [["Ciepło roczne", M.fmt(r.heatMwhYear) + " MWh/rok"],["Energia el. do napędu", M.fmt(r.electricityMwhYear) + " MWh/rok"],["Koszt energii el.", M.money(r.electricityCostPlnYear) + "/rok"],["CAPEX orient.", M.money(r.capexPln)],["OPEX roczny orient.", M.money(r.opexPlnYear)]];
    else if (src.id === "biomasa") rows = [["Energia użyteczna", M.fmt(r.energyMwhYear) + " MWh/rok"],["Średnia moc", M.fmt(r.avgPowerKw) + " kW"],["Koszt paliwa", M.money(r.fuelCostPlnYear) + "/rok"],["CAPEX orient.", M.money(r.capexPln)],["OPEX roczny orient.", M.money(r.opexPlnYear)]];
    return {rows:rows, assumptions:r.assumptions||[], input:input};
  }

  /** Wspólny układ A4 dla OZE i porównania — ten sam silnik co PDF PV. */
  function newReportDoc(title, subtitle) {
    const doc = window.PVPdf.createDoc(currentPdfTheme());
    doc.setFooter([M.AUTHOR_LINE]);
    doc.header(title, subtitle);
    doc.y = 165;
    return doc;
  }

  function fitText(doc, value, maxWidth, font) {
    const ctx = doc.ctx;
    ctx.font = font;
    let text = String(value === undefined || value === null ? "" : value);
    if (ctx.measureText(text).width <= maxWidth) return text;
    while (text.length > 1 && ctx.measureText(text + "…").width > maxWidth) {
      text = text.slice(0, -1);
    }
    return text + "…";
  }

  function pdfImagesFromCanvases(canvases) {
    const C = window.PVPdf.constants;
    return canvases.map(function (canvas) {
      return {
        bytes: window.PVPdf.dataUrlBytes(canvas.toDataURL("image/jpeg", 0.9)),
        w: C.PXW, h: C.PXH,
      };
    });
  }

  function drawFirstPage(target, canvases) {
    const canvas = canvases[0];
    previewPages = canvases.length;
    target.width = canvas.width;
    target.height = canvas.height;
    const ctx = target.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(canvas, 0, 0);
  }

  function buildOzePdfCanvases(src) {
    const C = window.PVPdf.constants, W = C.W, MG = C.MARGIN;
    const doc = newReportDoc(
      "Formalność OZE — " + src.name,
      "Wynik orientacyjny · " + M.todayPl() + " · wersja " + M.VERSION);
    const L = doc.line, f = doc.f, c = doc.c;

    doc.sectionTitle("Opis źródła", L.h2);
    doc.wrapped(src.description, f.body, c.BODY_INK, MG, W - 2 * MG, L.body);
    doc.y += 12;

    doc.ensure(L.h2 + 40);
    doc.sectionTitle("Wynik kalkulatora (orientacyjny)", L.h2);
    ozeReportRows(src).rows.forEach(function (row) {
      doc.ensure(34);
      doc.text(row[0], f.body, c.MUTED, MG, doc.y);
      doc.text(fitText(doc, row[1], W - 2 * MG - 520, f.body),
               f.body, c.INK, MG + 520, doc.y);
      doc.y += doc.row + 6;
    });
    doc.y += 12;

    doc.ensure(L.h2 + 40);
    doc.sectionTitle("Ścieżka formalna — checklista", L.h2);
    (src.formalPath.steps || []).slice(0, 8).forEach(function (step, i) {
      const title = (i + 1) + ". " + step.name;
      const titleLines = doc.countLines(title, f.h3, W - 2 * MG - 70);
      const descLines = doc.countLines(step.desc, f.small, W - 2 * MG - 70);
      const height = 10 + titleLines * L.h3 + 6 + descLines * L.small + 12;
      doc.ensure(height + 20);
      doc.cardRect(doc.y, height);
      doc.y += 10;
      doc.wrapped(title, f.h3, c.INK, MG + 44, W - 2 * MG - 70, L.h3);
      doc.y += 6;
      doc.wrapped(step.desc, f.small, c.BODY_INK, MG + 44, W - 2 * MG - 70, L.small);
      doc.y += 12;
    });

    const disclaimer = "Ważne: " + M.OZE_DISCLAIMER;
    const discLines = doc.countLines(disclaimer, f.small, W - 2 * MG - 44);
    const discHeight = 24 + discLines * L.small;
    doc.ensure(discHeight + 20);
    doc.box(MG, doc.y, W - 2 * MG, discHeight,
            c.id === "simple" ? null : c.WARN_BG, c.WARN_LINE, doc.shape.radius);
    doc.y += 12;
    doc.wrapped(disclaimer, f.small, c.NEED, MG + 22, W - 2 * MG - 44, L.small);
    doc.y += 12;

    doc.finish([M.AUTHOR_LINE]);
    return doc.pages.map(function (page) { return page.canvas; });
  }

  async function renderOzePdf(src) {
    if (window.PVPdf.ensureFonts) await window.PVPdf.ensureFonts();
    return window.PVPdf.buildPdf(pdfImagesFromCanvases(buildOzePdfCanvases(src)));
  }

  async function renderOzePdfPreview(src, target) {
    if (window.PVPdf.ensureFonts) await window.PVPdf.ensureFonts();
    drawFirstPage(target, buildOzePdfCanvases(src));
  }

  function buildComparePdfCanvases(rows) {
    const C = window.PVPdf.constants, W = C.W, MG = C.MARGIN;
    const doc = newReportDoc(
      "Formalność OZE - Porównanie wariantów",
      "Wynik orientacyjny · " + M.todayPl() + " · wersja " + M.VERSION);
    const L = doc.line, f = doc.f, c = doc.c;

    doc.sectionTitle("Wniosek orientacyjny", L.h2);
    const best = rows.find(function (row) { return row.recommended; });
    const verdict = best
      ? "Najkorzystniejszy wariant: " + best.name + ", prosty zwrot " +
        M.fmtPayback(best.paybackYears) + ", bilans roczny " +
        M.money(best.netPlnYear) + "."
      : "Brak jednoznacznie opłacalnego wariantu przy bieżących założeniach.";
    doc.ensure(doc.countLines(verdict, f.body, W - 2 * MG) * L.body + 12);
    doc.wrapped(verdict, f.body, c.BODY_INK, MG, W - 2 * MG, L.body);
    doc.y += 12;

    doc.ensure(L.h2 + 40);
    doc.sectionTitle("Porównanie", L.h2);
    const cols = [MG, MG + 360, MG + 500, MG + 680, MG + 900];
    const heads = ["Wariant", "Energia", "CAPEX", "Bilans/rok", "Zwrot"];
    doc.ensure(34);
    doc.box(MG, doc.y - 4, W - 2 * MG, 24,
            c.TABLE_HEAD_BG, null, Math.min(8, doc.shape.radius));
    heads.forEach(function (head, i) {
      doc.text(head, f.small, c.CELL, cols[i], doc.y);
    });
    doc.rule(doc.y + 24);
    doc.y += 30;

    rows.forEach(function (row) {
      doc.ensure(36);
      if (row.recommended) {
        doc.box(MG - 10, doc.y - 16, W - 2 * MG + 20, 30,
                c.BEST_BG, null, Math.min(8, doc.shape.radius));
      }
      doc.text(fitText(doc, row.name, 340, f.small), f.small, c.INK, cols[0], doc.y);
      doc.text(fitText(doc, M.fmt(row.energyMwhYear) + " MWh", 130, f.small),
               f.small, c.BODY_INK, cols[1], doc.y);
      doc.text(fitText(doc, M.money(row.capexPln), 170, f.small),
               f.small, c.BODY_INK, cols[2], doc.y);
      doc.text(fitText(doc, M.money(row.netPlnYear), 210, f.small),
               f.small, c.BODY_INK, cols[3], doc.y);
      doc.text(fitText(doc, M.fmtPayback(row.paybackYears), 150, f.small),
               f.small, row.recommended ? c.BEST_INK : c.BODY_INK, cols[4], doc.y);
      doc.y += doc.row + 8;
    });
    doc.y += 12;

    const note = "Uwaga: porównanie orientacyjne. Przychód/wartość = energia × " +
      "cena energii. Bilans = przychód − OPEX (geo: + koszt energii el., " +
      "biomasa: + koszt paliwa). Prosty zwrot = CAPEX / bilans roczny.";
    const noteLines = doc.countLines(note, f.small, W - 2 * MG - 44);
    const noteHeight = 24 + noteLines * L.small;
    doc.ensure(noteHeight + 20);
    doc.box(MG, doc.y, W - 2 * MG, noteHeight,
            c.id === "simple" ? null : c.WARN_BG, c.WARN_LINE, doc.shape.radius);
    doc.y += 12;
    doc.wrapped(note, f.small, c.NEED, MG + 22, W - 2 * MG - 44, L.small);
    doc.y += 12;

    doc.finish([M.AUTHOR_LINE]);
    return doc.pages.map(function (page) { return page.canvas; });
  }

  async function renderComparePdf() {
    if (window.PVPdf.ensureFonts) await window.PVPdf.ensureFonts();
    return window.PVPdf.buildPdf(
      pdfImagesFromCanvases(buildComparePdfCanvases(collectCompareRows())));
  }

  async function initComparePreview() {
    const canvas = $("#preview-canvas");
    if (!canvas) return;
    if (window.PVPdf.ensureFonts) await window.PVPdf.ensureFonts();
    drawFirstPage(canvas, buildComparePdfCanvases(collectCompareRows()));
  }

  async function doComparePdf() {
    busyStart();
    try {
      readCompareForm();
      const bytes = await renderComparePdf();
      download(bytes, "Formalnosc_OZE_porownanie_" + stamp() + ".pdf", "application/pdf");
      toast("PDF porównania pobrany.", "ok");
    } catch (err) {
      toast("Nie udało się utworzyć PDF: " + err.message, "err");
    } finally { busyStop(); }
  }

  function resetForm() {
    project = emptyProject();
    saveProject();
    render();
    toast("Formularz wyczyszczony.", "ok");
  }

  /** Czyta miejsce montażu, lokalizację, moc i powierzchnię z formularza PV. */
  function readForm() {
    const kw = $("#f-kw"), w = $("#f-w");
    if (!kw && !w) return;
    const place = $("#f-place"), prot = $("#f-protected");
    if (place) project.roof = place.value === "roof";
    if (prot) project.protectedArea = !!prot.checked;
    const m2 = $("#f-m2"), ha = $("#f-ha");
    project.ha = project.areaUnit === "m2" && m2
      ? numberOr(m2.value, 0) / 10000
      : ha ? numberOr(ha.value, 0) : project.ha;
    project.kw = project.powerUnit === "W" && w
      ? numberOr(w.value, 0) / 1000
      : kw ? numberOr(kw.value, 0) : project.kw;
    project.est = M.estimateOptions(project.est);
    saveProject();
  }

  // --- start ---------------------------------------------------------------

  function mount() {
    const app = document.getElementById("app");
    app.innerHTML =
      '<header class="topbar">' +
      '<a class="brand" href="#/start"><span class="logo">BIM OZE</span>' +
      '<span class="brand-text"><strong>Formalność OZE</strong><small>wersja web ' +
      esc(M.VERSION) + "</small></span></a>" +
      '<div class="topbar-tools">' +
      '<span class="chip save">zapis lokalny</span>' +
      '<span class="chip test">wersja testowa</span>' +
      "</div></header>" +
      '<nav class="steps" id="steps"></nav>' +
      '<main id="view"></main>' +
      '<footer class="footer">' +
      "<span>" + esc(M.AUTHOR_LINE) + "</span>" +
      '<span>Formalność OZE · wersja web</span>' +
      "</footer>";

    document.addEventListener("click", async function (e) {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      const src = btn.getAttribute("data-source");
      if (act === "go") go(btn.getAttribute("data-path"));
      else if (act === "reset") resetForm();
      else if (act === "pdf") await doPdf();
      else if (act === "pv-scroll-result") { readForm(); render(); setTimeout(function(){ var el=document.getElementById("pv-wynik"); if(el) el.scrollIntoView({behavior:"smooth",block:"start"}); }, 60); }
      else if (act === "pv-preview") {
        readForm();
        try { await initPvPreview(); toast("Podgląd odświeżony.", "ok"); }
        catch (err) { toast("Nie udało się odświeżyć podglądu: " + err.message, "err"); }
      }
      else if (act === "oze-calc") { readOzeForm(src); render(); toast("Kalkulator przeliczony (wynik orientacyjny).", "ok"); }
      else if (act === "oze-reset") { project.oze.inputs[src] = M.ozeDefaultInput(src); saveProject(); render(); toast("Przywrócono domyślne wartości.", "ok"); }
      else if (act === "oze-pdf") { readOzeForm(src); await doOzePdf(src); }
      else if (act === "oze-preview") {
        readOzeForm(src);
        try { await initOzePreview(src); toast("Podgląd odświeżony.", "ok"); }
        catch (err) { toast("Nie udało się odświeżyć podglądu: " + err.message, "err"); }
      }
      else if (act === "cmp-calc") { readCompareForm(); render(); toast("Porównanie przeliczone (wynik orientacyjny).", "ok"); }
      else if (act === "cmp-reset") { project.compare = defaultCompare(); saveProject(); render(); toast("Przywrócono domyślne założenia porównania.", "ok"); }
      else if (act === "cmp-pdf") { readCompareForm(); await doComparePdf(); }
      else if (act === "cmp-preview") {
        readCompareForm();
        try { await initComparePreview(); toast("Podgląd odświeżony.", "ok"); }
        catch (err) { toast("Nie udało się odświeżyć podglądu: " + err.message, "err"); }
      }
    });

    const numericFields = ["f-ha", "f-m2", "f-kw", "f-w"];
    document.addEventListener("change", function (e) {
      if (!e.target) return;
      if (e.target.id === "f-pdf-theme") {
        const theme = e.target.value;
        if (window.PVPdf.themes.some(function (t) { return t.id === theme; })) {
          const head = normalizeRoute(route()[0]);
          if (OZE_TAB_IDS.indexOf(head) >= 0) readOzeForm(head);
          else if (head === "porownaj") readCompareForm();
          else if (head === "pv") readForm();
          project.pdfTheme = theme;
          saveProject();
          render();
        }
        return;
      }
      if (e.target.id === "f-area-unit") {
        if (e.target.value !== "m2" && e.target.value !== "ha") return;
        readForm();
        project.areaUnit = e.target.value;
        saveProject();
        render();
        return;
      }
      if (e.target.id === "f-power-unit") {
        if (e.target.value !== "kW" && e.target.value !== "W") return;
        readForm();
        project.powerUnit = e.target.value;
        saveProject();
        render();
        return;
      }
      if (e.target.id === "f-place" || e.target.id === "f-protected") {
        readForm();
        render();
      }
    });
    document.addEventListener("input", function (e) {
      if (!e.target) return;
      if (numericFields.indexOf(e.target.id) >= 0) { readForm(); return; }
      if (String(e.target.id || "").indexOf("oze-") === 0) readOzeForm();
      if (String(e.target.id || "").indexOf("cmp-") === 0) readCompareForm();
    });

    window.addEventListener("hashchange", render);
  }

  function init() {
    if (!M || !P || !window.PVPdf) {
      document.getElementById("app").innerHTML =
        '<div class="panel" style="margin:24px"><h2>Błąd ładowania programu</h2>' +
        "<p>Brakuje jednego z plików silnika (js/). Sprawdź, czy cały katalog został opublikowany.</p></div>";
      return;
    }
    project = loadProject();
    mount();
    if (!location.hash) location.hash = "#/start";
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
