/* ==========================================================================
   PV Formalność — wersja web
   app.js — interfejs: routing, formularz, wynik, podgląd, eksport, licencja.
   Wszystkie dane pozostają w przeglądarce (localStorage). Nic nie jest
   wysyłane na serwer. Dokumenty powstają lokalnie (JS + Canvas).
   ========================================================================== */
(function () {
  "use strict";

  const M = window.PVModel;
  const L = window.PVLicense;
  const PROJECT_KEY = "pvformalnosc.project.v1";

  let project = null;
  let licence = null;
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
      roof: false,
      protectedArea: false,
      ha: 1,
      kw: 6,
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

  // --- licencja ------------------------------------------------------------

  function refreshLicence() {
    const state = L.load();
    licence = L.status(state);
    licence.state = state;
    licence.maskedKey = state.Key ? formatKey(state.Key) : "";
    const trialEnd = new Date(new Date(state.FirstStartUtc).getTime() + L.TRIAL_DAYS * 86400000);
    licence.trialEnd = trialEnd.toISOString();
    licence.daysLeft = state.Kind === "lifetime" ? null : L.yearDaysLeft(state);
    licence.holder = "";
    licence.expires = state.Kind === "year" && state.ActivatedUtc
      ? new Date(new Date(state.ActivatedUtc).getTime() + L.YEAR_DAYS * 86400000).toISOString()
      : "";
    licence.serial = "";
    return licence;
  }

  function formatKey(canon) { return L.format(canon); }

  function gate() {
    if (!licence) refreshLicence();
    return licence.valid;
  }

  function licenceBadge() {
    if (!licence) return "";
    const cls = licence.valid ? (licence.licensed ? "ok" : "trial") : "bad";
    return '<a href="#/licencja"><span class="chip ' + cls + '">' +
      esc(licence.short) + (licence.valid ? "" : " · WYMAGANY KLUCZ") + "</span></a>";
  }

  // --- routing -------------------------------------------------------------

  const TITLES = {
    start: "Start", dane: "Dane", wynik: "Wynik", podglad: "Podgląd",
    eksport: "Eksport", licencja: "Licencja", "o-programie": "O programie",
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
    ["dane", "Dane", "Parametry instalacji"],
    ["wynik", "Wynik", "Ścieżka formalna"],
    ["podglad", "Podgląd", "Strona A4"],
    ["eksport", "Eksport", "PDF i XLSX"],
    ["licencja", "Licencja", "Klucz i próbka"],
    ["o-programie", "O programie", "Informacje"],
  ];

  function renderSteps(head) {
    const box = $("#steps");
    if (!box) return;
    box.innerHTML = STEPS.map(function (s) {
      const active = s[0] === head;
      return '<a class="step' + (active ? " active" : "") + '" href="#/' + s[0] + '">' +
        "<span>" + esc(s[1]) + "</span><small>" + esc(s[2]) + "</small></a>";
    }).join("");
  }

  // --- widoki --------------------------------------------------------------

  function viewStart() {
    const r = currentResult();
    return '<section class="hero">' +
      '<div class="hero-text">' +
      "<h1>Formalności dla instalacji fotowoltaicznej</h1>" +
      "<p>Sprawdź w kilka sekund, jakie decyzje i uzgodnienia są potrzebne dla Twojej instalacji. " +
      "Wynik zawiera ścieżkę z gov.pl, listę kroków w kolejności oraz gotowe dokumenty PDF 300 DPI i XLSX.</p>" +
      '<div class="hero-actions">' +
      '<button class="btn primary" data-act="go" data-path="dane">Rozpocznij analizę</button>' +
      '<button class="btn gold" data-act="go" data-path="wynik">Zobacz bieżący wynik</button>' +
      "</div></div>" +
      '<div class="hero-card">' +
      '<span class="badge">' + esc(M.THRESHOLDS_LINE) + "</span>" +
      "<h2>Aktualna ścieżka</h2>" +
      "<p><strong>" + esc(r.path_name) + "</strong></p>" +
      "<p class=\"small\">" + esc(r.path_meta) + "</p>" +
      "</div></section>" +
      '<section class="panel"><h2>Jak to działa</h2>' +
      '<p class="small muted">Program nie wysyła danych nigdzie poza Twoją przeglądarkę. ' +
      "Dane formularza i stan licencji są zapisywane lokalnie (localStorage). " +
      "Eksport PDF i XLSX jest generowany w pełni lokalnie — bez drukarki i bez serwera.</p>" +
      '<p class="small">' + esc(M.DISCLAIMER) + "</p></section>";
  }

  function viewDane() {
    const p = project;
    return '<div class="page-head"><div><h1>Dane instalacji</h1>' +
      "<p>Podaj podstawowe parametry — wynik aktualizuje się natychmiast.</p></div></div>" +
      '<section class="panel"><div class="grid">' +
      '<div class="field wide"><label class="field-label">Miejsce montażu</label>' +
      '<select id="f-place">' +
      '<option value="ground"' + (!p.roof ? " selected" : "") + ">" + esc(M.PLACE_GROUND) + "</option>" +
      '<option value="roof"' + (p.roof ? " selected" : "") + ">" + esc(M.PLACE_ROOF) + "</option>" +
      "</select></div>" +
      '<label class="checkline wide"><input type="checkbox" id="f-protected"' +
      (p.protectedArea ? " checked" : "") + "><span>" + esc(M.LOC_PROTECTED) +
      " <small class=\"muted\">(próg 0,5 ha zamiast 2 ha)</small></span></label>" +
      '<div class="field"><label class="field-label">Powierzchnia (ha)</label>' +
      '<input type="number" id="f-ha" min="0" step="0.01" value="' + esc(M.fmt(p.ha)) + '">' +
      '<span class="hint">Liczoną po obrysie zewnętrznych modułów.</span></div>' +
      '<div class="field"><label class="field-label">Moc (kW)</label>' +
      '<input type="number" id="f-kw" min="0" step="0.1" value="' + esc(M.fmt(p.kw)) + '">' +
      '<span class="hint">Łączna moc zainstalowanych modułów.</span></div>' +
      "</div>" +
      '<div class="row-actions"><button class="btn primary" data-act="go" data-path="wynik">Pokaż wynik</button>' +
      '<button class="btn" data-act="reset">Wyczyść formularz</button></div></section>' +
      '<section class="panel"><h3>Progi decyzji</h3><p class="small muted">' +
      esc(M.THRESHOLDS_LINE) + "</p></section>";
  }

  function verdictBox(need, title, desc) {
    return '<div class="verdict' + (need ? " need" : "") + '">' +
      "<h3>" + esc(title) + "</h3>" +
      '<div class="mark">' + (need ? "TAK" : "NIE") + "</div>" +
      "<p>" + esc(desc) + "</p></div>";
  }

  function viewWynik() {
    const r = currentResult();
    return '<div class="page-head"><div><h1>Wynik analizy</h1>' +
      "<p>" + esc(M.todayPl()) + " · wersja " + esc(M.VERSION) + "</p></div>" +
      '<div class="row-actions" style="margin:0">' +
      '<button class="btn" data-act="go" data-path="podglad">Podgląd A4</button>' +
      '<button class="btn primary" data-act="go" data-path="eksport">Eksportuj</button>' +
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
      '<section class="panel footnote"><p>' + esc(M.SOURCE_LINE) + "</p>" +
      "<p>" + esc(M.DISCLAIMER) + "</p><p>" + esc(M.AUTHOR_LINE) + "</p></section>";
  }

  function viewPodglad() {
    const pages = previewPages > 1 ? " · strona 1 z " + previewPages : "";
    return '<div class="page-head"><div><h1>Podgląd dokumentu</h1>' +
      "<p>Tak wygląda eksportowany plik PDF (A4, 300 DPI)" + esc(pages) + ".</p></div>" +
      '<div class="row-actions" style="margin:0">' +
      '<button class="btn primary" data-act="pdf">Pobierz PDF</button>' +
      '<button class="btn" data-act="go" data-path="eksport">Więcej opcji</button>' +
      "</div></div>" +
      '<section class="panel"><div class="preview-wrap"><div class="paper">' +
      '<canvas id="preview-canvas" width="2480" height="3508"></canvas>' +
      "</div></div></section>";
  }

  function viewEksport() {
    return '<div class="page-head"><div><h1>Eksport</h1>' +
      "<p>Dokumenty są tworzone lokalnie w przeglądarce i pobierane bezpośrednio na dysk.</p></div></div>" +
      '<section class="export-grid">' +
      '<div class="export-card"><span class="badge">PDF · 300 DPI</span>' +
      "<h3>Raport z wynikiem</h3>" +
      "<p>Jedna lub więcej stron A4 (2480 × 3508 px), polskie znaki, bez drukarki i bez przeglądarki wydruku.</p>" +
      '<button class="btn primary" data-act="pdf">Pobierz PDF</button></div>' +
      '<div class="export-card"><span class="badge">XLSX</span>' +
      "<h3>Arkusz kalkulacyjny</h3>" +
      "<p>Wynik, dane wejściowe i pełna lista kroków w jednym arkuszu. Bez zależności zewnętrznych.</p>" +
      '<button class="btn primary" data-act="xlsx">Pobierz XLSX</button></div>' +
      "</section>" +
      '<section class="panel"><h3>Parność z wersją desktopową 1.3.0</h3>' +
      '<p class="small muted">Silnik kalkulatora, teksty decyzji i kolejność kroków są identyczne jak w ' +
      "aplikacji Python. PDF używa tego samego układu A4 i rozdzielczości 300 DPI.</p></section>";
  }

  function stat(k, v) {
    return '<div class="stat"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + "</span></div>";
  }

  function stateLabel(state) {
    return {
      trial: "wersja próbna", trial_expired: "okres próbny upłynął",
      licensed: "licencja pełna", expired: "licencja wygasła", invalid: "klucz nieprawidłowy",
    }[state] || state;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? m[3] + "." + m[2] + "." + m[1] : iso;
  }

  function viewLicencja() {
    const lic = licence;
    const cls = lic.valid ? (lic.licensed ? "ok" : "trial") : "bad";
    return '<div class="page-head"><div><h1>Licencja</h1>' +
      "<p>Program działa " + L.TRIAL_DAYS + " dni w wersji próbnej, a następnie wymaga klucza.</p></div></div>" +
      '<section class="panel licence ' + cls + '"><h2>' + esc(lic.summary) + "</h2>" +
      '<div class="lic-grid">' +
      stat("Stan", stateLabel(lic.kind)) +
      stat("Okres próbny do", fmtDate(lic.trialEnd)) +
      stat("Pozostało dni", lic.licensed
        ? (lic.daysLeft === null ? "bezterminowo" : String(lic.daysLeft))
        : String(lic.trialDaysLeft)) +
      (lic.key ? stat("Klucz", lic.key) : "") +
      (lic.expires ? stat("Ważna do", fmtDate(lic.expires)) : "") +
      "</div>" +
      (lic.state && lic.state.Key && lic.kind === "expired"
        ? '<p class="small err">Klucz roczny wygasł — aktywuj nowy klucz.</p>' : "") +
      "</section>" +
      '<section class="panel"><h2>Aktywacja klucza</h2>' +
      '<div class="grid">' +
      '<div class="field wide"><label class="field-label">Klucz licencyjny</label>' +
      '<input type="text" id="lic-key" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" spellcheck="false"></div>' +
      "</div>" +
      '<div class="row-actions"><button class="btn primary" data-act="activate">Aktywuj klucz</button>' +
      (lic.state && lic.state.Key ? '<button class="btn danger" data-act="deactivate">Usuń klucz</button>' : "") +
      "</div>" +
      '<p class="small muted">Klucz jest sprawdzany lokalnie przez SHA-256 (w kodzie zapisane są wyłącznie hashe). ' +
      "Aktywacja nie wymaga internetu.</p></section>" +
      '<section class="panel"><h3>Uwaga o wersji przeglądarkowej</h3>' +
      '<p class="small">Stan licencji jest przechowywany w pamięci przeglądarki (localStorage). ' +
      "Wyczyszczenie danych witryny usuwa zapis. Wersja desktopowa przechowuje stan dodatkowo w systemie " +
      "(%LOCALAPPDATA% oraz rejestr Windows) i jest z nią kompatybilna pod względem kluczy.</p></section>";
  }

  function viewAbout() {
    return '<div class="page-head"><div><h1>O programie</h1></div></div>' +
      '<section class="panel about">' +
      '<div class="about-brand"><span class="logo">PV</span><div>' +
      "<h2>PV Formalność — wersja web</h2><p>" +
      "Analiza ścieżki formalnej dla instalacji fotowoltaicznej.</p></div></div>" +
      '<div class="lic-grid">' +
      stat("Wersja", M.VERSION) +
      stat("Wydanie", "Statyczna wersja web (GitHub Pages)") +
      stat("Autor", "Rami Nassar") +
      stat("Firma", "BIM architects & consultants") +
      stat("Kontakt", "raminassar.arch@gmail.com") +
      "</div>" +
      '<p class="small">' + esc(M.THRESHOLDS_LINE) + "</p>" +
      '<p class="small">' + esc(M.SOURCE_LINE) + "</p>" +
      '<p class="small">' + esc(M.DISCLAIMER) + "</p>" +
      "</section>" +
      '<section class="panel"><h3>Prywatność</h3><p class="small">' +
      "Wszystkie dane projektu pozostają w Twojej przeglądarce. Aplikacja nie wysyła ich na żaden serwer. " +
      "Jedynymi zasobami ładowanymi lokalnie są pliki programu oraz fonty DejaVu.</p></section>";
  }

  // --- render --------------------------------------------------------------

  function render() {
    if (!project) project = loadProject();
    if (!licence) refreshLicence();

    if (!gate()) {
      if (route()[0] !== "licencja") { go("licencja"); return; }
    }

    const head = route()[0];
    const badge = $("#lic-badge");
    if (badge) badge.innerHTML = licenceBadge();

    let html = "";
    if (head === "dane") html = viewDane();
    else if (head === "wynik") html = viewWynik();
    else if (head === "podglad") html = viewPodglad();
    else if (head === "eksport") html = viewEksport();
    else if (head === "licencja") html = viewLicencja();
    else if (head === "o-programie") html = viewAbout();
    else html = viewStart();

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
      previewPages = await window.PVPdf.renderPreview(currentResult(), canvas);
      const note = $(".page-head p");
      if (note && previewPages > 1) {
        note.textContent = "Tak wygląda eksportowany plik PDF (A4, 300 DPI) · strona 1 z " + previewPages + ".";
      }
    } catch (err) {
      toast("Nie udało się przygotować podglądu: " + err.message, "err");
    }
  }

  // --- akcje ---------------------------------------------------------------

  async function activateKey() {
    const input = $("#lic-key");
    if (!input) return;
    busyStart();
    try {
      const check = await L.validate(input.value);
      if (!check.ok) { toast(check.message, "err"); return; }
      const state = refreshLicence().state;
      L.activate(state, input.value, check.kind);
      refreshLicence();
      toast("Licencja aktywowana: " + licence.summary, "ok");
      render();
    } catch (err) {
      toast("Błąd aktywacji: " + err.message, "err");
    } finally {
      busyStop();
    }
  }

  function deactivateKey() {
    const state = refreshLicence().state;
    state.Key = null; state.Kind = null; state.ActivatedUtc = null;
    L.save(state);
    refreshLicence();
    toast("Klucz usunięty.", "ok");
    render();
  }

  async function doPdf() {
    busyStart();
    try {
      const bytes = await window.PVPdf.renderPdf(currentResult());
      download(bytes, "PV_Formalnosc_wynik_" + stamp() + ".pdf", "application/pdf");
      toast("PDF 300 DPI pobrany.", "ok");
    } catch (err) {
      toast("Nie udało się utworzyć PDF: " + err.message, "err");
    } finally { busyStop(); }
  }

  function doXlsx() {
    busyStart();
    try {
      const bytes = window.PVXlsx.build(currentResult());
      download(bytes, "PV_Formalnosc_wynik_" + stamp() + ".xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      toast("XLSX pobrany.", "ok");
    } catch (err) {
      toast("Nie udało się utworzyć XLSX: " + err.message, "err");
    } finally { busyStop(); }
  }

  function resetForm() {
    project = emptyProject();
    saveProject();
    render();
    toast("Formularz wyczyszczony.", "ok");
  }

  function readForm() {
    const place = $("#f-place"), prot = $("#f-protected"), ha = $("#f-ha"), kw = $("#f-kw");
    if (!place || !prot || !ha || !kw) return;
    project.roof = place.value === "roof";
    project.protectedArea = !!prot.checked;
    project.ha = numberOr(ha.value, 0);
    project.kw = numberOr(kw.value, 0);
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
      '<span id="lic-badge" class="lic-badge"></span>' +
      "</div></header>" +
      '<nav class="steps" id="steps"></nav>' +
      '<main id="view"></main>' +
      '<footer class="footer">' +
      "<span>" + esc(M.AUTHOR_LINE) + "</span>" +
      '<span><a href="#/licencja">Licencja</a> · <a href="#/o-programie">O programie</a></span>' +
      "</footer>";

    document.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      if (act === "go") go(btn.getAttribute("data-path"));
      else if (act === "reset") resetForm();
      else if (act === "activate") activateKey();
      else if (act === "deactivate") deactivateKey();
      else if (act === "pdf") doPdf();
      else if (act === "xlsx") doXlsx();
    });

    document.addEventListener("change", function (e) {
      if (e.target && (e.target.id === "f-place" || e.target.id === "f-protected")) {
        readForm();
      }
    });
    document.addEventListener("input", function (e) {
      if (e.target && (e.target.id === "f-ha" || e.target.id === "f-kw")) readForm();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target && e.target.id === "lic-key") activateKey();
    });

    window.addEventListener("hashchange", render);
  }

  function init() {
    if (!M || !L || !window.PVPdf || !window.PVXlsx) {
      document.getElementById("app").innerHTML =
        '<div class="panel" style="margin:24px"><h2>Błąd ładowania programu</h2>' +
        "<p>Brakuje jednego z plików silnika (js/). Sprawdź, czy cały katalog został opublikowany.</p></div>";
      return;
    }
    project = loadProject();
    refreshLicence();
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
