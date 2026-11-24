/* ==========================================================================
   PV Formalność — wersja web 2.0.0
   app.js — interfejs: routing, formularz, wynik, podgląd, płatność 30 zł, PDF.
   Wszystkie dane pozostają w przeglądarce. Dokumenty powstają lokalnie
   (JS + Canvas), bez drukarki i bez serwera. Płatność odbywa się w Przelewy24.
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

  const TITLES = {
    start: "Start", dane: "Dane", oze: "Inne OZE", wynik: "Wynik", podglad: "Podgląd",
    platnosc: "Płatność", "o-programie": "O programie",
  };

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
    ["dane", "Dane PV", "Parametry instalacji"],
    ["oze", "Inne OZE", "Wiatr, woda, geo, biomasa"],
    ["platnosc", "Płatność", "Dostęp do wyniku · 30 zł"],
    ["wynik", "Wynik PV", "Ścieżka formalna"],
    ["podglad", "Podgląd", "Strona A4"],
    ["o-programie", "O programie", "Informacje"],
  ];

  function renderSteps(head) {
    const box = $("#steps");
    if (!box) return;
    const paid = !!paidSession();
    box.innerHTML = STEPS.map(function (s) {
      const active = s[0] === head;
      const gated = s[0] === "wynik" || s[0] === "podglad";
      if (gated && !paid) {
        return '<span class="step locked" title="Dostęp po opłacie 30 zł">' +
          '<span><span class="lock" aria-hidden="true">🔒</span> ' + esc(s[1]) + "</span>" +
          "<small>Dostęp po opłacie</small></span>";
      }
      return '<a class="step' + (active ? " active" : "") + '" href="#/' + s[0] + '">' +
        "<span>" + esc(s[1]) + "</span><small>" + esc(s[2]) + "</small></a>";
    }).join("");
  }

  // --- widoki --------------------------------------------------------------

  function viewStart() {
    return '<section class="hero">' +
      '<div class="hero-text">' +
      "<h1>Formalności OZE: PV + inne źródła</h1>" +
      (TEST
        ? '<p class="lead"><strong>Wersja testowa:</strong> moduł PV działa jak dotychczas, a nowa zakładka <strong>Inne OZE</strong> dodaje sekcje, kalkulatory orientacyjne i szablony ścieżek formalnych dla wiatru, wody, geotermii oraz biomasy/biogazu. Wynik PV, podgląd A4 i raport PDF są dostępne bez opłaty.</p>'
        : '<p class="lead">Wprowadź dane PV, sprawdź inne źródła OZE, przejdź płatność 30 zł i zobacz wynik. Moduł PV ma pełny raport PDF 300 DPI.</p>') +
      '<div class="hero-actions">' +
      '<button class="btn gold" data-act="go" data-path="dane">Kalkulator PV</button>' +
      '<button class="btn" data-act="go" data-path="oze">Inne OZE</button>' +
      '<a class="btn ghost" href="#/o-programie">O programie</a></div></div>' +
      '<div class="hero-card"><span class="logo">OZE</span><strong>Nowa zakładka</strong>' +
      '<p>Wiatr · Woda · Geotermia · Biomasa/Biogaz</p></div></section>' +
      '<div class="card-grid">' +
      card("PV — pełny moduł", "Istniejący kalkulator PV, ścieżka formalna, wycena, optymalizator i raport PDF pozostają bez zmian merytorycznych.") +
      card("Inne OZE", "Nowe sekcje i kalkulatory orientacyjne dla wiatru, wody, geotermii oraz biomasy/biogazu.") +
      card("Ścieżki formalne", "Szablony checklist do potwierdzenia w źródłach urzędowych — bez niezweryfikowanych progów prawnych.") +
      card("Źródła i disclaimery", "Karty oparte o gov.pl + materiały pomocnicze BGK; każdy wynik wymaga potwierdzenia przed realizacją.") +
      '</div>' +
      '<section class="panel"><h2>Jak to działa</h2><ol class="plain-ol">' +
      '<li><strong>Dane PV</strong> — pełny kalkulator i ścieżka formalna fotowoltaiki.</li>' +
      '<li><strong>Inne OZE</strong> — wybierz źródło, policz orientacyjny wynik i przejrzyj checklistę formalną.</li>' +
      (TEST ? '<li><strong>Wynik PV</strong> — wersja testowa pokazuje wynik PV bez opłaty; OZE jest dostępne informacyjnie.</li>'
            : '<li><strong>Płatność/Wynik PV</strong> — płatność odblokowuje pełny wynik PV i PDF.</li>') +
      '</ol></section>';
  }

  function ozeInput(sourceId) {
    const src = M.ozeById(sourceId);
    const saved = (project.oze && project.oze.inputs && project.oze.inputs[sourceId]) || {};
    return Object.assign(M.ozeDefaultInput(sourceId), saved);
  }

  function readOzeForm() {
    const src = M.ozeById(project.oze.source);
    if (!src.calculator || !src.calculator.fields) return;
    const inp = Object.assign({}, ozeInput(src.id));
    src.calculator.fields.forEach(function (f) {
      const el = document.getElementById("oze-" + f.key);
      if (el) inp[f.key] = numberOr(el.value, inp[f.key]);
    });
    project.oze.inputs[src.id] = inp;
    saveProject();
  }

  function renderOzeResult(src) {
    if (!src.calculator || src.calculator.kind === "link") {
      return '<div class="oze-result muted">Ten moduł ma pełny kalkulator w zakładce <a href="#/dane">Dane PV</a>.</div>';
    }
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
    return '<div class="oze-result">' +
      '<div class="kpi-row">' + rows.slice(0,3).map(function (x) { return '<div class="kpi"><span>' + esc(x[0]) + '</span><strong>' + esc(x[1]) + '</strong></div>'; }).join("") + '</div>' +
      '<table class="data-table"><tbody>' + rows.map(function (x) { return '<tr><th>' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td></tr>'; }).join("") + '</tbody></table>' +
      '<div class="note warn"><strong>Założenia orientacyjne:</strong><ul>' + (r.assumptions||[]).map(function(a){return '<li>'+esc(a)+'</li>';}).join("") + '</ul></div>' +
      '</div>';
  }

  function viewOze() {
    const src = M.ozeById(project.oze && project.oze.source);
    project.oze.source = src.id;
    const input = ozeInput(src.id);
    const cards = M.OZE_SOURCES.map(function (s) {
      const active = s.id === src.id;
      return '<button class="oze-card' + (active ? ' active' : '') + '" data-act="oze-source" data-source="' + esc(s.id) + '">' +
        '<span class="oze-dot" style="background:' + esc(s.color) + '"></span>' +
        '<strong>' + esc(s.name) + '</strong><span>' + esc(s.short) + '</span></button>';
    }).join("");
    const govPoints = (src.govPoints || []).map(function (g) { return '<li>' + esc(g) + '</li>'; }).join("");
    let calcHtml = '';
    if (src.calculator && src.calculator.kind === 'link') {
      calcHtml = '<div class="panel"><h3>Kalkulator</h3><p>Pełny kalkulator i ścieżka formalna PV są w głównym module.</p><a class="btn gold" href="#/dane">Przejdź do Dane PV</a></div>';
    } else if (src.calculator) {
      const fields = src.calculator.fields.map(function (f) {
        const val = input[f.key];
        return '<div class="field"><label class="field-label" for="oze-' + esc(f.key) + '">' + esc(f.label) + '</label>' +
          '<input id="oze-' + esc(f.key) + '" type="number" inputmode="decimal" step="' + esc(String(f.step||0.1)) + '" min="' + esc(String(f.min==null?0:f.min)) + '"' + (f.max!=null?' max="'+esc(String(f.max))+'"':'') + ' value="' + esc(String(val==null?"":val)) + '">' +
          '</div>';
      }).join("");
      calcHtml = '<div class="panel"><h3>Kalkulator orientacyjny</h3><div class="form-grid oze-grid">' + fields + '</div>' +
        '<div class="row-actions"><button class="btn" data-act="oze-calc">Przelicz</button><button class="btn ghost" data-act="oze-reset">Przywróć domyślne</button></div>' +
        renderOzeResult(src) + '</div>';
    }
    const steps = (src.formalPath.steps || []).map(function (st, i) {
      const badge = st.status === 'ready' ? '<span class="badge ok">gotowe</span>' : '<span class="badge warn">do potwierdzenia</span>';
      return '<div class="step-card"><div class="step-no">' + (i+1) + '</div><div class="step-body"><h4>' + esc(st.name) + ' ' + badge + '</h4><p>' + esc(st.desc) + '</p>' +
        (st.sourceHint ? '<p class="small muted">Źródło/weryfikacja: ' + esc(st.sourceHint) + '</p>' : '') + '</div></div>';
    }).join("");
    const sources = (src.formalPath.sources || []).map(function (s) {
      return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + '</a>' + (s.date ? ' <span class="muted">(' + esc(s.date) + ')</span>' : '') + (s.note ? '<div class="small muted">' + esc(s.note) + '</div>' : '') + '</li>';
    }).join("");
    return '<div class="page-head"><div><h1>Inne odnawialne źródła energii</h1>' +
      '<p>Nowa zakładka: sekcje źródłowe, kalkulatory orientacyjne i szablony ścieżek formalnych. Moduł PV pozostaje osobny i bez zmian.</p></div></div>' +
      '<section class="panel"><div class="oze-cards">' + cards + '</div></section>' +
      '<section class="panel"><h2>' + esc(src.name) + '</h2><p>' + esc(src.description) + '</p>' +
      '<div class="note"><strong>Zakres wg gov.pl (opisowo):</strong><ul>' + govPoints + '</ul></div>' +
      '<div class="note warn"><strong>Ważne:</strong> ' + esc(M.OZE_DISCLAIMER) + '</div></section>' +
      calcHtml +
      '<section class="panel"><h3>' + esc(src.formalPath.title) + '</h3><p>' + esc(src.formalPath.summary) + '</p>' +
      '<div class="step-list">' + steps + '</div>' +
      '<h4>Źródła do weryfikacji</h4><ul class="plain-list">' + sources + '</ul></section>';
  }

  function numField(id, label, value, step, hint) {
    return '<div class="field"><label class="field-label">' + esc(label) + "</label>" +
      '<input type="number" id="' + id + '" min="0" step="' + step + '" value="' +
      esc(M.fmt(value)) + '">' +
      (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + "</div>";
  }

  function viewDane() {
    const p = project;
    return '<div class="page-head"><div><h1>Dane instalacji</h1>' +
      "<p>Edytowalne są tylko moc i powierzchnia. Pozostałe parametry są stałe i " +
      "zostają pokazane w raporcie PDF.</p></div></div>" +
      '<section class="panel"><div class="grid">' +
      '<div class="field"><span class="field-label">Miejsce montażu</span>' +
      '<span class="readonly-value">' + esc(p.roof ? M.PLACE_ROOF : M.PLACE_GROUND) + "</span>" +
      '<span class="hint">Wartość stała (nieedytowalna).</span></div>' +
      '<div class="field"><span class="field-label">Lokalizacja</span>' +
      '<span class="readonly-value">' + esc(p.protectedArea ? M.LOC_PROTECTED : M.LOC_NORMAL) + "</span>" +
      '<span class="hint">Wartość stała (nieedytowalna).</span></div>' +
      numField("f-ha", "Powierzchnia (ha)", p.ha, "0.01",
               "Po obrysie zewnętrznych modułów — podstawa doboru paneli.") +
      numField("f-kw", "Moc deklarowana (kW)", p.kw, "0.1",
               "Liczba paneli jest dobierana z mocy i powierzchni.") +
      "</div></section>" +
      '<div class="row-actions"><button class="btn primary" data-act="go" data-path="platnosc">Płatność i wynik</button>' +
      '<button class="btn" data-act="reset">Wyczyść formularz</button></div>' +
      '<section class="panel"><h3>Progi decyzji</h3><p class="small muted">' +
      esc(M.THRESHOLDS_LINE) + "</p></section>";
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

  function viewWynik() {
    const r = currentResult();
    return '<div class="page-head"><div><h1>Wynik analizy</h1>' +
      "<p>" + esc(M.todayPl()) + " · wersja " + esc(M.VERSION) + "</p></div>" +
      '<div class="row-actions" style="margin:0">' +
      themePicker() +
      '<button class="btn" data-act="go" data-path="podglad">Podgląd A4</button>' +
      '<button class="btn primary" data-act="pdf">Pobierz PDF</button>' +
      "</div></div>" +
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
      estimatePanel(currentEstimate()) +
      optimizerPanel(currentOptimizer()) +
      '<section class="panel footnote"><p>' + esc(M.SOURCE_LINE) + "</p>" +
      "<p>" + esc(M.DISCLAIMER) + "</p><p>" + esc(M.AUTHOR_LINE) + "</p></section>";
  }

  function viewPodglad() {
    const pages = previewPages > 1 ? " · strona 1 z " + previewPages : "";
    return '<div class="page-head"><div><h1>Podgląd dokumentu</h1>' +
      "<p>Tak wygląda eksportowany plik PDF (A4, 300 DPI)" + esc(pages) + ".</p></div>" +
      '<div class="row-actions" style="margin:0">' +
      themePicker() +
      '<button class="btn primary" data-act="pdf">Pobierz PDF</button>' +
      '<button class="btn" data-act="go" data-path="wynik">Wróć do wyniku</button>' +
      "</div></div>" +
      '<section class="panel"><div class="preview-wrap"><div class="paper">' +
      '<canvas id="preview-canvas" width="2480" height="3508"></canvas>' +
      "</div></div></section>";
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

  function viewPlatnosc() {
    const session = P.currentSession();
    const paid = P.isPaid(session);
    const mode = TEST
      ? "WERSJA TESTOWA — dostęp bez opłaty"
      : (P.configured()
          ? "Bramka skonfigurowana — weryfikacja przez backend"
          : "TRYB KONFIGURACYJNY — brak backendu");
    return '<div class="page-head"><div><h1>' +
      (TEST ? "Dostęp do wyniku — wersja testowa" : "Płatność za dostęp do wyniku") +
      "</h1><p>" +
      (TEST
        ? "Wersja testowa: wynik, podgląd A4 i raport PDF są dostępne bez opłaty."
        : "Ostatni krok przed wynikiem: opłata 30 zł przez Przelewy24. Po zapłacie zobaczysz " +
          "ścieżkę formalną i pobierzesz raport PDF bez dodatkowej opłaty.") +
      "</p></div></div>" +
      '<section class="panel pay-card' + (paid ? " paid" : "") + '">' +
      '<div class="pay-price"><strong>' + (TEST ? "0 zł" : "30 zł") +
      "</strong><span>" +
      (TEST ? "wersja testowa · wynik + jeden raport PDF"
            : "jednorazowo · wynik + jeden raport PDF") +
      "</span></div>" +
      '<div class="lic-grid">' +
      stat("Metoda", TEST ? "Wersja testowa" : "Przelewy24") +
      stat("Waluta", P.CURRENCY) +
      stat("Zakres", "Wynik + 1 raport PDF · 300 DPI") +
      stat("Sesja", session ? String(session).slice(0, 12) + "…" : "nowa po kliknięciu") +
      stat("Status", paid ? "Dostęp otwarty — przejdź do wyniku" : "Oczekuje na płatność") +
      stat("Tryb", mode) +
      "</div>" +
      '<div class="row-actions">' +
      (TEST ? "" : '<button class="btn" data-act="pay-open">1. Otwórz stronę płatności</button>') +
      '<button class="btn primary" data-act="pay-confirm">' +
      (TEST ? "Przejdź do wyniku i PDF" : "2. Potwierdź i zobacz wynik") +
      "</button></div>" +
      (TEST
        ? '<p class="small muted">To jest wersja testowa — nie są pobierane żadne dane ' +
          "płatności. Wynik, podgląd i PDF działają bez opłaty.</p>"
        : (P.configured() ? "" :
            '<p class="small err">Bramka nie jest skonfigurowana — ustaw createUrl ' +
            "i verifyUrl przez PVPayment.saveConfig(). Bez potwierdzonej płatności " +
            "wynik pozostaje zablokowany.</p>")) +
      "</section>";
  }

  function viewAbout() {
    return '<div class="page-head"><div><h1>O programie</h1></div></div>' +
      '<section class="panel about">' +
      '<div class="about-brand"><span class="logo">PV</span><div>' +
      "<h2>PV Formalność — wersja web</h2><p>" +
      "Analiza ścieżki formalnej dla instalacji fotowoltaicznej.</p></div></div>" +
      '<div class="lic-grid">' +
      stat("Wersja", M.VERSION) +
      stat("Wydanie", TEST ? "Statyczna wersja web — testowa (GitHub Pages)"
                           : "Statyczna wersja web (GitHub Pages)") +
      stat("Wynik + PDF", TEST ? "bez opłaty · wersja testowa"
                               : P.PRICE_ZL + " zł · Przelewy24") +
      stat("Autor", "Rami Nassar") +
      stat("Firma", "BIM architects & consultants") +
      stat("Kontakt", "raminassar.arch@gmail.com") +
      "</div>" +
      (TEST ? '<p class="small">' + esc(window.PVPdf.watermark || "WERSJA TESTOWA") +
              " — znak wodny na każdej stronie raportu PDF i w podglądzie A4.</p>" : "") +
      '<p class="small">' + esc(M.THRESHOLDS_LINE) + "</p>" +
      '<p class="small">' + esc(M.SOURCE_LINE) + "</p>" +
      '<p class="small">' + esc(M.DISCLAIMER) + "</p>" +
      "</section>" +
      '<section class="panel"><h3>Prywatność</h3><p class="small">' +
      "Dane projektu pozostają w Twojej przeglądarce. Obliczenia i pdf powstają lokalnie. " +
      "Jedynym zewnętrznym krokiem jest płatność w Przelewy24 oraz — po skonfigurowaniu — " +
      "wywołanie endpointów własnego backendu w celu potwierdzenia transakcji.</p></section>";
  }

  // --- render --------------------------------------------------------------

  /** Wymaga opłaconej sesji; w wersji testowej sesja jest tworzona i oznaczana automatycznie. */
  function paidSession() {
    if (TEST) {
      let session = P.currentSession();
      if (!session) session = P.newSession();
      if (!P.isPaid(session)) P.markPaid(session);
      return session;
    }
    const session = P.currentSession();
    return session && P.isPaid(session) ? session : null;
  }

  /** Przekierowanie bez dopisywania nowego wpisu do historii przeglądarki. */
  function replaceHash(path) {
    const target = "#/" + path;
    try {
      if (location.hash === target) { render(); return; }
      history.replaceState(null, "", target);
    } catch (err) {
      location.replace(target);
      return;
    }
    render();
  }

  function render() {
    if (!project) project = loadProject();
    let head = route()[0];
    if (head === "eksport") { replaceHash("platnosc"); return; }
    if ((head === "wynik" || head === "podglad") && !paidSession()) {
      replaceHash("platnosc");
      return;
    }

    let html = "";
    if (head === "dane") html = viewDane();
    else if (head === "oze") html = viewOze();
    else if (head === "wynik") html = viewWynik();
    else if (head === "podglad") html = viewPodglad();
    else if (head === "platnosc") html = viewPlatnosc();
    else if (head === "o-programie") html = viewAbout();
    else { head = "start"; html = viewStart(); }

    const view = $("#view");
    if (view) view.innerHTML = html;
    renderSteps(head);
    document.title = (TITLES[head] || "Start") + " – PV Formalność " + M.VERSION;

    if (head === "podglad") initPreview();
  }

  async function initPreview() {
    const canvas = $("#preview-canvas");
    if (!canvas) return;
    try {
      previewPages = await window.PVPdf.renderPreview(
        currentResult(), canvas, currentEstimate(), currentOptimizer(),
        currentPdfTheme());
      const note = $(".page-head p");
      if (note && previewPages > 1) {
        note.textContent = "Tak wygląda eksportowany plik PDF (A4, 300 DPI) · strona 1 z " + previewPages + ".";
      }
    } catch (err) {
      toast("Nie udało się przygotować podglądu: " + err.message, "err");
    }
  }

  // --- płatność i eksport --------------------------------------------------

  async function openPayment() {
    if (paidSession()) { go("wynik"); return; }
    let session = P.currentSession();
    if (!session) session = P.newSession();
    busyStart();
    try {
      const url = await P.registerPayment(session);
      rootOpen(url);
      toast("Otwarto stronę Przelewy24. Po zapłacie kliknij „Potwierdź i zobacz wynik”.", "ok");
    } catch (err) {
      toast("Nie udało się otworzyć płatności: " + err.message, "err");
    } finally { busyStop(); }
  }

  function rootOpen(url) {
    const win = window.open(url, "_blank");
    if (!win) toast("Przeglądarka zablokowała nowe okno — otwórz link ręcznie.", "err");
  }

  /** PDF powstaje dopiero po potwierdzonej opłacie. Zwraca true po pobraniu. */
  async function doPdf() {
    const session = paidSession();
    if (!session) {
      toast("Najpierw opłać dostęp do wyniku (30 zł) — PDF nie został wygenerowany.", "err");
      go("platnosc");
      return false;
    }
    busyStart();
    try {
      const bytes = await window.PVPdf.renderPdf(
        currentResult(), currentEstimate(), currentOptimizer(), currentPdfTheme());
      download(bytes, "PV_Formalnosc_wynik_" + stamp() + ".pdf", "application/pdf");
      toast("PDF 300 DPI pobrany.", "ok");
      P.consume(session);  // jedna opłata = jeden raport
      return true;
    } catch (err) {
      toast("Nie udało się utworzyć PDF: " + err.message, "err");
      return false;
    } finally { busyStop(); }
  }

  /** Potwierdza płatność i dopiero wtedy otwiera wynik. */
  async function confirmAndShowResult() {
    let session = paidSession();
    if (!session) {
      session = P.currentSession();
      if (!session) session = P.newSession();
      if (P.configured()) {
        busyStart();
        let ok = false;
        try { ok = await P.verify(session); }
        finally { busyStop(); }
        if (!ok) {
          toast("Płatność nie została potwierdzona przez serwer. Spróbuj ponownie po zapłacie.", "err");
          return;
        }
        P.markPaid(session);
      } else {
        toast("Bramka nie jest skonfigurowana. Wynik jest dostępny dopiero po " +
              "potwierdzonej płatności — ustaw createUrl i verifyUrl w konfiguracji.", "err");
        return;
      }
    }
    toast(TEST ? "Wersja testowa — otwieramy wynik."
               : "Płatność potwierdzona — przygotowujemy wynik.", "ok");
    go("wynik");
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
      '<span class="brand-text"><strong>PV Formalność</strong><small>wersja web ' +
      esc(M.VERSION) + "</small></span></a>" +
      '<div class="topbar-tools">' +
      '<span class="chip save">zapis lokalny</span>' +
      (TEST ? '<span class="chip test">wersja testowa</span>' : "") +
      '<span class="chip pay">' + (TEST ? "Wynik bez opłaty" : "Wynik 30 zł") + "</span>" +
      "</div></header>" +
      '<nav class="steps" id="steps"></nav>' +
      '<main id="view"></main>' +
      '<footer class="footer">' +
      "<span>" + esc(M.AUTHOR_LINE) + "</span>" +
      '<span><a href="#/platnosc">Płatność</a> · <a href="#/o-programie">O programie</a></span>' +
      "</footer>";

    document.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      if (act === "go") go(btn.getAttribute("data-path"));
      else if (act === "reset") resetForm();
      else if (act === "pay-open") openPayment();
      else if (act === "pay-confirm") confirmAndShowResult();
      else if (act === "pdf") doPdf();
      else if (act === "oze-source") {
        project.oze.source = btn.getAttribute("data-source") || "wiatr";
        if (!M.ozeById(project.oze.source)) project.oze.source = "wiatr";
        saveProject(); render();
      } else if (act === "oze-calc") {
        readOzeForm(); render(); toast("Kalkulator OZE przeliczony (wynik orientacyjny).", "ok");
      } else if (act === "oze-reset") {
        const id = project.oze.source;
        project.oze.inputs[id] = M.ozeDefaultInput(id); saveProject(); render();
        toast("Przywrócono domyślne wartości kalkulatora.", "ok");
      }
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
