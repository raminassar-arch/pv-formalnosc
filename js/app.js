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
      roof: false, protectedArea: false, ha: 1, kw: 6,
      est: M.estimateOptions(),
      optMode: "both",
      pdfTheme: window.PVPdf.defaultTheme,
      oze: { source: "wiatr", inputs: {} },
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
        kw: numberOr(data.kw, base.kw),
        est: M.estimateOptions(data.est),
        optMode: "both", // dobór z mocy i powierzchni — brak pola do edycji
        pdfTheme: window.PVPdf.themes.some(function (t) { return t.id === data.pdfTheme; })
          ? data.pdfTheme : window.PVPdf.defaultTheme,
        oze: (function(){ var o=Object.assign({source:"wiatr",inputs:{}}, data.oze||{}); if(!M.ozeById(o.source)) o.source="wiatr"; o.inputs=o.inputs||{}; return o; })(),
        compare: Object.assign({ pricePlnMwh: 800, pvYieldKwhKwYear: 1050, pvOpexPctYear: 1.5 }, data.compare || {}),
      };
    } catch (err) { return base; }
  }

  function numberOr(value, fallback) {
    const n = Number(value);
    return isFinite(n) && n >= 0 ? n : fallback;
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
    ["biomasa", "Biomasa", "Biomasa / biogaz / biopłyny"],
    ["porownaj", "Porównaj", "Opłacalność wariantów OZE"],
  ];
  const OZE_TAB_IDS = ["wiatr","woda","geotermia","biomasa"];
  const TITLES = {start:"Start",pv:"Fotowoltaika",wiatr:"Wiatr",woda:"Woda",geotermia:"Geotermia",biomasa:"Biomasa",porownaj:"Porównaj OZE"};

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

  function viewStart() {
    const tabs = [
      {id:"pv", icon:"PV", name:"Fotowoltaika", desc:"Kalkulator mocy/powierzchni, dobór modułów, wycena, optymalizator, ścieżka formalna, podgląd A4 i PDF."},
      {id:"wiatr", icon:"WI", name:"Energetyka wiatrowa", desc:"Kalkulator orientacyjny (moc, wiatr, Cp), energia roczna, CAPEX/OPEX i checklista KPK gov.pl (do potwierdzenia)."},
      {id:"woda", icon:"H2O", name:"Energetyka wodna", desc:"Kalkulator orientacyjny (przepływ, spadek, sprawność), energia roczna i checklista KPK gov.pl (do potwierdzenia)."},
      {id:"geotermia", icon:"GEO", name:"Geotermia / pompy ciepła", desc:"Kalkulator orientacyjny (zapotrzebowanie, COP), koszt energii, CAPEX/OPEX i checklista KPK gov.pl (do potwierdzenia)."},
      {id:"biomasa", icon:"BIO", name:"Biomasa / biogaz / biopłyny", desc:"Kalkulator orientacyjny (paliwo, wartość opałowa, sprawność), energia i checklista KPK gov.pl (do potwierdzenia)."},
      {id:"porownaj", icon:"≡", name:"Porównaj warianty", desc:"Porównanie orientacyjnej opłacalności wariantów OZE na podstawie danych z zakładek: energia, CAPEX/OPEX, przychód, prosty okres zwrotu."}
    ];
    const tabCards = tabs.map(function(t){
      return '<article class="card start-tab-card">' +
        '<div class="start-tab-icon">' + esc(t.icon) + '</div>' +
        '<h3>' + esc(t.name) + '</h3><p>' + esc(t.desc) + '</p>' +
        '<div class="row-actions"><button class="btn" data-act="go" data-path="' + esc(t.id) + '">Otwórz zakładkę</button></div>' +
        '</article>';
    }).join("");
    return '<section class="hero">' +
      '<div class="hero-text">' +
      '<h1>Formalność OZE</h1>' +
      '<p class="lead">Aplikacja do wstępnej oceny formalności i parametrów dla odnawialnych źródeł energii. Każda technologia ma osobną zakładkę z kalkulatorem, checklistą formalną, podglądem i eksportem PDF.</p>' +
      '<div class="hero-actions">' +
      '<button class="btn gold" data-act="go" data-path="pv">Fotowoltaika</button>' +
      '<button class="btn" data-act="go" data-path="wiatr">Wiatr</button>' +
      '<button class="btn ghost" data-act="go" data-path="woda">Woda</button>' +
      '<button class="btn ghost" data-act="go" data-path="geotermia">Geotermia</button>' +
      '<button class="btn ghost" data-act="go" data-path="biomasa">Biomasa</button>' +
      '<button class="btn ghost" data-act="go" data-path="porownaj">Porównaj</button></div></div>' +
      '<div class="hero-card"><span class="logo">OZE</span><strong>Co zawiera program</strong>' +
      '<ul class="plain-list small">' +
      '<li>5 osobnych zakładek technologii OZE</li>' +
      '<li>Zakładka Porównaj: opłacalność wariantów</li>' +
      '<li>Kalkulatory orientacyjne</li>' +
      '<li>Checklisty KPK gov.pl (do potwierdzenia)</li>' +
      '<li>Podgląd A4 i eksport PDF</li>' +
      '<li>Watermark: wersja testowa</li>' +
      '</ul></div></section>' +
      '<section class="panel"><h2>Zakładki w programie</h2><p class="muted">Wybierz technologię — wynik, podgląd i PDF znajdują się na dole każdej zakładki.</p>' +
      '<div class="card-grid start-tab-grid">' + tabCards + '</div></section>' +
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
      const badge = st.status === 'ready' ? '<span class="badge ok">gotowe</span>' : '<span class="badge warn">do potwierdzenia</span>';
      return '<div class="step-card"><div class="step-no">' + (i+1) + '</div><div class="step-body"><h4>' + esc(st.name) + ' ' + badge + '</h4><p>' + esc(st.desc) + '</p>' +
        (st.sourceHint ? '<p class="small muted">Źródło/weryfikacja: ' + esc(st.sourceHint) + '</p>' : '') + '</div></div>';
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
    const sources = (src.formalPath.sources || []).map(function (s) {
      return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + '</a>' + (s.date ? ' <span class="muted">(' + esc(s.date) + ')</span>' : '') + (s.note ? '<div class="small muted">' + esc(s.note) + '</div>' : '') + '</li>';
    }).join("");
    return '<div class="page-head"><div><h1>' + esc(src.name) + '</h1><p>' + esc(src.description) + '</p></div></div>' +
      '<section class="panel"><div class="note"><strong>Zakres wg gov.pl (opisowo):</strong><ul>' + govPoints + '</ul></div>' +
      '<div class="note warn"><strong>Ważne:</strong> ' + esc(M.OZE_DISCLAIMER) + '</div></section>' +
      '<section class="panel"><h3>Kalkulator orientacyjny</h3><div class="form-grid oze-grid">' + fields + '</div>' +
      '<div class="row-actions"><button class="btn" data-act="oze-calc" data-source="' + esc(src.id) + '">Przelicz</button>' +
      '<button class="btn ghost" data-act="oze-reset" data-source="' + esc(src.id) + '">Przywróć domyślne</button></div></section>' +
      '<section class="panel"><h2>Wynik — ' + esc(src.name) + '</h2>' + renderOzeResult(src) + '</section>' +
      '<section class="panel"><h3>' + esc(src.formalPath.title) + '</h3><p>' + esc(src.formalPath.summary) + '</p>' +
      '<div class="step-list">' + ozeStepList(src) + '</div>' +
      '<h4>Źródła do weryfikacji</h4><ul class="plain-list">' + sources + '</ul></section>' +
      '<section class="panel"><h2>Podgląd i PDF</h2><p class="small muted">Podgląd dokumentu A4 i eksport PDF dla tej zakładki.</p>' +
      '<div class="row-actions"><button class="btn primary" data-act="oze-pdf" data-source="' + esc(src.id) + '">Pobierz PDF</button>' +
      '<button class="btn" data-act="oze-preview" data-source="' + esc(src.id) + '">Odśwież podgląd</button></div>' +
      '<div class="preview-wrap"><div class="paper"><canvas id="preview-canvas" width="2480" height="3508"></canvas></div></div></section>';
  }

  function numField(id, label, value, step, hint) {
    return '<div class="field"><label class="field-label">' + esc(label) + "</label>" +
      '<input type="number" id="' + id + '" min="0" step="' + step + '" value="' +
      esc(M.fmt(value)) + '">' +
      (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + "</div>";
  }

  function verdictBox(need, title, desc) {
    return '<div class="verdict' + (need ? " need" : "") + '">' +
      "<h3>" + esc(title) + "</h3>" +
      '<div class="mark">' + (need ? "TAK" : "NIE") + "</div>" +
      "<p>" + esc(desc) + "</p></div>";
  }

  /** Wybór stylu to opcja eksportu — staje się dostępna dopiero po opłacie. */
  function themePicker() {
    return '<label class="theme-pick"><span>Styl raportu</span>' +
      '<select id="f-pdf-theme">' +
      window.PVPdf.themes.map(function (t) {
        return '<option value="' + esc(t.id) + '"' +
          (t.id === project.pdfTheme ? " selected" : "") + ">" + esc(t.name) + "</option>";
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
      '<section class="panel" id="pv-wynik"><h2>Wynik analizy</h2><p class="small muted">' + esc(M.todayPl()) + ' · wersja ' + esc(M.VERSION) + '</p>' +
      '<div class="row-actions">' + themePicker() +
      '<button class="btn primary" data-act="pdf">Pobierz PDF</button></div></section>' +
      '<section class="panel"><div class="grid">' +
      '<div class="field"><span class="field-label">Miejsce montażu</span><span>' + esc(r.place_text) + "</span></div>" +
      '<div class="field"><span class="field-label">Lokalizacja</span><span>' + esc(r.location_text) + "</span></div>" +
      '<div class="field"><span class="field-label">Powierzchnia</span><span>' + esc(M.fmt(r.ha)) + " ha</span></div>" +
      '<div class="field"><span class="field-label">Moc</span><span>' + esc(M.fmt(r.kw)) + " kW</span></div>" +
      "</div></section>" +
      '<section class="panel"><div class="verdict-grid">' +
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
      '<section class="panel"><h2>Podgląd i PDF</h2><p class="small muted">Podgląd dokumentu A4 (300 DPI) i eksport PDF.</p>' +
      '<div class="row-actions"><button class="btn primary" data-act="pdf">Pobierz PDF</button>' +
      '<button class="btn" data-act="pv-preview">Odśwież podgląd</button></div>' +
      '<div class="preview-wrap"><div class="paper"><canvas id="preview-canvas" width="2480" height="3508"></canvas></div></div></section>' +
      '<section class="panel footnote"><p>' + esc(M.SOURCE_LINE) + "</p>" +
      "<p>" + esc(M.DISCLAIMER) + "</p><p>" + esc(M.AUTHOR_LINE) + "</p></section>";
  }

  function viewDaneBody() {
    const p = project;
    return '<section class="panel"><h2>Dane instalacji</h2><div class="grid">' +
      '<div class="field"><span class="field-label">Miejsce montażu</span>' +
      '<span class="readonly-value">' + esc(p.roof ? M.PLACE_ROOF : M.PLACE_GROUND) + "</span>" +
      '<span class="hint">Wartość stała (nieedytowalna).</span></div>' +
      '<div class="field"><span class="field-label">Lokalizacja</span>' +
      '<span class="readonly-value">' + esc(p.protectedArea ? M.LOC_PROTECTED : M.LOC_NORMAL) + "</span>" +
      '<span class="hint">Wartość stała (nieedytowalna).</span></div>' +
      numField("f-ha", "Powierzchnia (ha)", p.ha, "0.01", "Po obrysie zewnętrznych modułów — podstawa doboru paneli.") +
      numField("f-kw", "Moc deklarowana (kW)", p.kw, "0.1", "Liczba paneli jest dobierana z mocy i powierzchni.") +
      "</div>" +
      '<div class="row-actions"><button class="btn primary" data-act="pv-scroll-result">Pokaż wynik</button>' +
      '<button class="btn" data-act="reset">Wyczyść formularz</button></div>' +
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
    if (!project.compare) project.compare = { pricePlnMwh: 800, pvYieldKwhKwYear: 1050, pvOpexPctYear: 1.5 };
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
      const payback = r.paybackYears == null ? "brak zwrotu" : M.fmt(r.paybackYears) + " lat";
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
        '. Prosty okres zwrotu: <strong>' + esc(M.fmt(best.paybackYears)) + ' lat</strong>, bilans roczny: <strong>' + esc(M.money(best.netPlnYear)) + '</strong>. ' +
        'Wynik zależy od założeń ceny energii, CAPEX/OPEX i danych wpisanych w zakładkach.</div>'
      : '<div class="note warn"><strong>Brak jednoznacznie opłacalnego wariantu</strong> przy bieżących założeniach. Sprawdź cenę energii, CAPEX/OPEX lub dane wejściowe w zakładkach.</div>';

    return '<div class="page-head"><div><h1>Porównaj warianty OZE</h1><p>Porównanie orientacyjne na podstawie aktualnych danych z zakładek: Fotowoltaika, Wiatr, Woda, Geotermia i Biomasa.</p></div></div>' +
      '<section class="panel"><h3>Założenia porównania</h3><p class="small muted">To porównanie uproszczone. Nie zastępuje audytu energetycznego, analizy finansowej ani studium wykonalności.</p>' +
      '<div class="form-grid oze-grid">' +
      '<div class="field"><label class="field-label" for="cmp-price">Cena energii / wartość energii [zł/MWh]</label><input id="cmp-price" type="number" min="0" step="10" value="' + esc(String(cmp.pricePlnMwh)) + '"></div>' +
      '<div class="field"><label class="field-label" for="cmp-pv-yield">PV: uzysk jednostkowy [kWh/kWp/rok]</label><input id="cmp-pv-yield" type="number" min="0" step="10" value="' + esc(String(cmp.pvYieldKwhKwYear)) + '"></div>' +
      '<div class="field"><label class="field-label" for="cmp-pv-opex">PV: OPEX roczny [% CAPEX]</label><input id="cmp-pv-opex" type="number" min="0" step="0.1" value="' + esc(String(cmp.pvOpexPctYear)) + '"></div>' +
      '</div>' +
      '<div class="row-actions"><button class="btn" data-act="cmp-calc">Przelicz porównanie</button>' +
      '<button class="btn ghost" data-act="cmp-reset">Przywróć domyślne</button></div></section>' +
      '<section class="panel"><h2>Wynik porównania</h2>' + bestBox +
      '<div class="table-wrap"><table class="data-table compare-table"><thead><tr>' +
      '<th>Wariant</th><th>Energia roczna</th><th>CAPEX</th><th>OPEX + paliwo/el.</th><th>Przychód/wartość</th><th>Bilans roczny</th><th>Prosty zwrot</th>' +
      '</tr></thead><tbody>' + tableRows + '</tbody></table></div>' +
      '<div class="note warn"><strong>Metoda:</strong> Przychód/wartość = energia roczna × cena energii. Bilans roczny = przychód/wartość − OPEX (dla geotermii doliczono koszt energii elektrycznej, dla biomasy koszt paliwa). Prosty zwrot = CAPEX / bilans roczny; gdy bilans ≤ 0, zwrot nie występuje. PV korzysta z mocy z zakładki Fotowoltaika i podanego uzysku kWh/kWp/rok.</div></section>' +
      '<section class="panel"><h2>Podgląd i PDF</h2><p class="small muted">Eksport porównania do PDF A4 z watermarkiem wersji testowej.</p>' +
      '<div class="row-actions"><button class="btn primary" data-act="cmp-pdf">Pobierz PDF porównania</button>' +
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

    if (head === "pv") initPvPreview();
    if (head === "porownaj") initComparePreview();
    if (OZE_TAB_IDS.indexOf(head) >= 0) initOzePreview(head);
  }

  async function initPvPreview() {
    const canvas = $("#preview-canvas");
    if (!canvas) return;
    try {
      previewPages = await window.PVPdf.renderPreview(
        currentResult(), canvas, currentEstimate(), currentOptimizer(), currentPdfTheme());
    } catch (err) { console.warn(err); }
  }

  async function initOzePreview(sourceId) {
    const canvas = $("#preview-canvas");
    if (!canvas) return;
    try {
      const src = M.ozeById(sourceId);
      await renderOzePdfPreview(src, canvas);
    } catch (err) { console.warn(err); }
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

  function buildOzePdfCanvas(src) {
    const PXW = window.PVPdf.constants.PXW, PXH = window.PVPdf.constants.PXH;
    const W=1240,H=1754,M=90;
    const c=document.createElement('canvas'); c.width=PXW; c.height=PXH;
    const ctx=c.getContext('2d'); ctx.scale(2,2); ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#0F2742'; ctx.fillRect(0,0,W,130);
    ctx.fillStyle='#fff'; ctx.font='bold 34px DejaVu, Arial, sans-serif'; ctx.fillText('Formalność OZE — ' + src.name, M, 52);
    ctx.font='20px DejaVu, Arial, sans-serif'; ctx.fillStyle='#B9CFDC'; ctx.fillText('Wynik orientacyjny · ' + M.todayPl() + ' · wersja ' + M.VERSION, M, 92);
    let y=170;
    ctx.fillStyle='#13263A'; ctx.font='bold 28px DejaVu, Arial, sans-serif'; ctx.fillText('Opis źródła', M, y); y+=36;
    ctx.font='20px DejaVu, Arial, sans-serif'; ctx.fillStyle='#33485B';
    const wrap=(text,x,yy,maxW,lh)=>{ const words=String(text||'').split(/\s+/); let line=''; for(const w of words){ const t=line?line+' '+w:w; if(ctx.measureText(t).width>maxW && line){ ctx.fillText(line,x,yy); yy+=lh; line=w; } else line=t; } if(line){ctx.fillText(line,x,yy); yy+=lh;} return yy; };
    y=wrap(src.description,M,y,W-2*M,28)+8;
    ctx.fillStyle='#13263A'; ctx.font='bold 28px DejaVu, Arial, sans-serif'; ctx.fillText('Wynik kalkulatora (orientacyjny)', M, y); y+=34;
    const rep=ozeReportRows(src);
    ctx.font='20px DejaVu, Arial, sans-serif';
    rep.rows.forEach(function(rw){ ctx.fillStyle='#5A6B7B'; ctx.fillText(rw[0],M,y); ctx.fillStyle='#13263A'; ctx.fillText(String(rw[1]),M+520,y); y+=30; });
    y+=10; ctx.fillStyle='#13263A'; ctx.font='bold 26px DejaVu, Arial, sans-serif'; ctx.fillText('Ścieżka formalna — checklista', M, y); y+=34;
    ctx.font='19px DejaVu, Arial, sans-serif';
    (src.formalPath.steps||[]).slice(0,8).forEach(function(st,i){ ctx.fillStyle='#13263A'; const badge=st.status==='ready'?'[gotowe]':'[do potwierdzenia]'; y=wrap((i+1)+'. '+st.name+' '+badge,M,y,W-2*M,26); ctx.fillStyle='#33485B'; y=wrap(st.desc,M+24,y,W-2*M-24,24)+6; });
    y+=8; ctx.fillStyle='#9A4A1A'; ctx.font='bold 20px DejaVu, Arial, sans-serif'; y=wrap('Ważne: '+M.OZE_DISCLAIMER,M,Math.min(y,H-170),W-2*M,24);
    ctx.fillStyle='#5A6B7B'; ctx.font='18px DejaVu, Arial, sans-serif';
    ctx.fillText(M.AUTHOR_LINE, M, H-50);
    if (window.PVPdf.watermark) { ctx.save(); ctx.globalAlpha=0.1; ctx.fillStyle='#0F2742'; ctx.font='bold 90px DejaVu, Arial, sans-serif'; ctx.translate(W/2,H/2); ctx.rotate(-Math.PI/6); ctx.textAlign='center'; ctx.fillText(window.PVPdf.watermark,0,0); ctx.restore(); }
    return c;
  }

  async function renderOzePdf(src) {
    if (window.PVPdf.ensureFonts) await window.PVPdf.ensureFonts();
    const c = buildOzePdfCanvas(src);
    const bytes = window.PVPdf.dataUrlBytes(c.toDataURL('image/jpeg',0.9));
    return window.PVPdf.buildPdf([{bytes:bytes,w:window.PVPdf.constants.PXW,h:window.PVPdf.constants.PXH}]);
  }

  async function renderOzePdfPreview(src, target) {
    if (window.PVPdf.ensureFonts) await window.PVPdf.ensureFonts();
    const c = buildOzePdfCanvas(src);
    target.width=c.width; target.height=c.height;
    target.getContext('2d').clearRect(0,0,c.width,c.height);
    target.getContext('2d').drawImage(c,0,0);
  }

  function buildComparePdfCanvas(rows) {
    const PXW = window.PVPdf.constants.PXW, PXH = window.PVPdf.constants.PXH;
    const W=1240,H=1754,M=90;
    const c=document.createElement("canvas"); c.width=PXW; c.height=PXH;
    const ctx=c.getContext("2d"); ctx.scale(2,2); ctx.fillStyle="#fff"; ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#0F2742"; ctx.fillRect(0,0,W,130);
    ctx.fillStyle="#fff"; ctx.font="bold 34px DejaVu, Arial, sans-serif"; ctx.fillText("Formalność OZE - Porównanie wariantów", M, 52);
    ctx.font="20px DejaVu, Arial, sans-serif"; ctx.fillStyle="#B9CFDC"; ctx.fillText("Wynik orientacyjny · " + M.todayPl() + " · wersja " + M.VERSION, M, 92);
    const wrap=(text,x,yy,maxW,lh)=>{ const words=String(text||"").split(/\s+/); let line=""; for(const w of words){ const t=line?line+" "+w:w; if(ctx.measureText(t).width>maxW && line){ ctx.fillText(line,x,yy); yy+=lh; line=w; } else line=t; } if(line){ctx.fillText(line,x,yy); yy+=lh;} return yy; };
    let y=170;
    const best = rows.find(function(r){return r.recommended;});
    ctx.fillStyle="#13263A"; ctx.font="bold 26px DejaVu, Arial, sans-serif"; ctx.fillText("Wniosek orientacyjny", M, y); y+=34;
    ctx.font="20px DejaVu, Arial, sans-serif"; ctx.fillStyle="#33485B";
    y = wrap(best ? ("Najkorzystniejszy wariant: " + best.name + ", prosty zwrot " + M.fmt(best.paybackYears) + " lat, bilans roczny " + M.money(best.netPlnYear) + ".") : "Brak jednoznacznie opłacalnego wariantu przy bieżących założeniach.", M, y, W-2*M, 28) + 10;
    ctx.fillStyle="#13263A"; ctx.font="bold 24px DejaVu, Arial, sans-serif"; ctx.fillText("Porównanie", M, y); y+=30;
    ctx.font="18px DejaVu, Arial, sans-serif";
    ctx.fillStyle="#5A6B7B"; ctx.fillText("Wariant", M, y); ctx.fillText("Energia", M+360, y); ctx.fillText("CAPEX", M+500, y); ctx.fillText("Bilans/rok", M+680, y); ctx.fillText("Zwrot", M+900, y); y+=10;
    ctx.strokeStyle="#D9E0E6"; ctx.beginPath(); ctx.moveTo(M,y); ctx.lineTo(W-M,y); ctx.stroke(); y+=24;
    rows.forEach(function(r){
      const payback = r.paybackYears == null ? "brak" : M.fmt(r.paybackYears) + " lat";
      if (r.recommended) { ctx.fillStyle="#F3F9F0"; ctx.fillRect(M-10,y-20,W-2*M+20,30); }
      ctx.fillStyle="#13263A"; ctx.fillText(String(r.name).slice(0,34), M, y);
      ctx.fillStyle="#33485B"; ctx.fillText(M.fmt(r.energyMwhYear)+" MWh", M+360, y);
      ctx.fillText(M.money(r.capexPln), M+500, y);
      ctx.fillText(M.money(r.netPlnYear), M+680, y);
      ctx.fillStyle = r.recommended ? "#2F6B2F" : "#33485B";
      ctx.fillText(payback, M+900, y);
      y += 32;
    });
    y += 12;
    ctx.fillStyle="#9A4A1A"; ctx.font="bold 19px DejaVu, Arial, sans-serif";
    y = wrap("Uwaga: porównanie orientacyjne. Przychód/wartość = energia × cena energii. Bilans = przychód − OPEX (geo: + koszt energii el., biomasa: + koszt paliwa). Prosty zwrot = CAPEX / bilans roczny.", M, Math.min(y,H-150), W-2*M, 24);
    ctx.fillStyle="#5A6B7B"; ctx.font="18px DejaVu, Arial, sans-serif"; ctx.fillText(M.AUTHOR_LINE, M, H-50);
    if (window.PVPdf.watermark) { ctx.save(); ctx.globalAlpha=0.1; ctx.fillStyle="#0F2742"; ctx.font="bold 90px DejaVu, Arial, sans-serif"; ctx.translate(W/2,H/2); ctx.rotate(-Math.PI/6); ctx.textAlign="center"; ctx.fillText(window.PVPdf.watermark,0,0); ctx.restore(); }
    return c;
  }

  async function renderComparePdf() {
    if (window.PVPdf.ensureFonts) await window.PVPdf.ensureFonts();
    const rows = collectCompareRows();
    const c = buildComparePdfCanvas(rows);
    const bytes = window.PVPdf.dataUrlBytes(c.toDataURL("image/jpeg",0.9));
    return window.PVPdf.buildPdf([{bytes:bytes,w:window.PVPdf.constants.PXW,h:window.PVPdf.constants.PXH}]);
  }

  async function initComparePreview() {
    const canvas = $("#preview-canvas");
    if (!canvas) return;
    try {
      if (window.PVPdf.ensureFonts) await window.PVPdf.ensureFonts();
      const c = buildComparePdfCanvas(collectCompareRows());
      canvas.width=c.width; canvas.height=c.height;
      canvas.getContext("2d").clearRect(0,0,c.width,c.height);
      canvas.getContext("2d").drawImage(c,0,0);
    } catch (err) { console.warn(err); }
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

  /** W formularzu czyta wyłącznie moc i powierzchnię — reszta jest stała. */
  function readForm() {
    const ha = $("#f-ha"), kw = $("#f-kw");
    if (!ha || !kw) return;
    project.ha = numberOr(ha.value, 0);
    project.kw = numberOr(kw.value, 0);
    project.est = M.estimateOptions(project.est);
    saveProject();
  }

  // --- start ---------------------------------------------------------------

  function mount() {
    const app = document.getElementById("app");
    app.innerHTML =
      '<header class="topbar">' +
      '<a class="brand" href="#/start"><span class="logo">PV</span>' +
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

    document.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      const src = btn.getAttribute("data-source");
      if (act === "go") go(btn.getAttribute("data-path"));
      else if (act === "reset") resetForm();
      else if (act === "pdf") doPdf();
      else if (act === "pv-scroll-result") { readForm(); render(); setTimeout(function(){ var el=document.getElementById("pv-wynik"); if(el) el.scrollIntoView({behavior:"smooth",block:"start"}); }, 60); }
      else if (act === "pv-preview") { readForm(); initPvPreview(); toast("Podgląd odświeżony.", "ok"); }
      else if (act === "oze-calc") { readOzeForm(src); render(); toast("Kalkulator przeliczony (wynik orientacyjny).", "ok"); }
      else if (act === "oze-reset") { project.oze.inputs[src] = M.ozeDefaultInput(src); saveProject(); render(); toast("Przywrócono domyślne wartości.", "ok"); }
      else if (act === "oze-pdf") { readOzeForm(src); doOzePdf(src); }
      else if (act === "oze-preview") { readOzeForm(src); initOzePreview(src); toast("Podgląd odświeżony.", "ok"); }
    });

    const numericFields = ["f-ha", "f-kw"];
    document.addEventListener("change", function (e) {
      if (!e.target) return;
      if (e.target.id === "f-pdf-theme") {
        const theme = e.target.value;
        if (window.PVPdf.themes.some(function (t) { return t.id === theme; })) {
          project.pdfTheme = theme;
          saveProject();
        }
        return;
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
