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
    return { roof: false, protectedArea: false, ha: 1, kw: 6 };
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

  // --- routing -------------------------------------------------------------

  const TITLES = {
    start: "Start", dane: "Dane", wynik: "Wynik", podglad: "Podgląd",
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
    ["dane", "Dane", "Parametry instalacji"],
    ["platnosc", "Płatność", "Dostęp do wyniku · 30 zł"],
    ["wynik", "Wynik", "Ścieżka formalna"],
    ["podglad", "Podgląd", "Strona A4"],
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
    return '<section class="hero">' +
      '<div class="hero-text">' +
      "<h1>Formalności dla instalacji fotowoltaicznej</h1>" +
      "<p>Podaj parametry instalacji, opłać 30 zł przez Przelewy24 i zobacz ścieżkę z gov.pl, " +
      "listę kroków w kolejności oraz raport PDF 300 DPI. Płatność otwiera dostęp do wyniku.</p>" +
      '<div class="hero-actions">' +
      '<button class="btn primary" data-act="go" data-path="dane">Rozpocznij analizę</button>' +
      '<button class="btn gold" data-act="go" data-path="platnosc">Płatność · 30 zł</button>' +
      "</div></div>" +
      '<div class="hero-card">' +
      '<span class="badge">' + esc(M.THRESHOLDS_LINE) + "</span>" +
      "<h2>Co otrzymasz</h2>" +
      "<p><strong>Ścieżka formalna krok po kroku</strong></p>" +
      '<p class="small">Wynik analizy, decyzje TAK/NIE i raport PDF 300 DPI — ' +
      "dostępne po opłacie 30 zł.</p>" +
      "</div></section>" +
      '<section class="panel"><h2>Jak to działa</h2>' +
      '<p class="small muted">Dane formularza są zapisywane wyłącznie w Twojej przeglądarce ' +
      "(localStorage). Po ich wprowadzeniu następuje płatność 30 zł w Przelewy24 — dopiero " +
      "po jej potwierdzeniu pokazywany jest wynik. Podgląd i PDF powstają lokalnie, bez drukarki " +
      "i bez serwera.</p>" +
      '<p class="small">' + esc(M.DISCLAIMER) + "</p></section>";
  }

  function viewDane() {
    const p = project;
    return '<div class="page-head"><div><h1>Dane instalacji</h1>' +
      "<p>Podaj podstawowe parametry — kolejnym krokiem jest płatność 30 zł, która otwiera wynik.</p></div></div>" +
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
      '<div class="row-actions"><button class="btn primary" data-act="go" data-path="platnosc">Płatność i wynik</button>' +
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
      '<section class="panel footnote"><p>' + esc(M.SOURCE_LINE) + "</p>" +
      "<p>" + esc(M.DISCLAIMER) + "</p><p>" + esc(M.AUTHOR_LINE) + "</p></section>";
  }

  function viewPodglad() {
    const pages = previewPages > 1 ? " · strona 1 z " + previewPages : "";
    return '<div class="page-head"><div><h1>Podgląd dokumentu</h1>' +
      "<p>Tak wygląda eksportowany plik PDF (A4, 300 DPI)" + esc(pages) + ".</p></div>" +
      '<div class="row-actions" style="margin:0">' +
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

  function viewPlatnosc() {
    const cfg = P.config();
    const session = P.currentSession();
    const paid = P.isPaid(session);
    const mode = P.configured()
      ? "Bramka skonfigurowana — weryfikacja przez backend"
      : "TRYB TESTOWY / KONFIGURACYJNY — nie pobieramy pieniędzy";
    return '<div class="page-head"><div><h1>Płatność za dostęp do wyniku</h1>' +
      "<p>Ostatni krok przed wynikiem: opłata 30 zł przez Przelewy24. Po zapłacie zobaczysz " +
      "ścieżkę formalną i pobierzesz raport PDF bez dodatkowej opłaty.</p></div></div>" +
      '<section class="panel pay-card' + (paid ? " paid" : "") + '">' +
      '<div class="pay-price"><strong>30 zł</strong><span>jednorazowo · wynik + jeden raport PDF</span></div>' +
      '<div class="lic-grid">' +
      stat("Metoda", "Przelewy24") +
      stat("Waluta", P.CURRENCY) +
      stat("Zakres", "Wynik + 1 raport PDF · 300 DPI") +
      stat("Sesja", session ? String(session).slice(0, 12) + "…" : "nowa po kliknięciu") +
      stat("Status", paid ? "Opłacono — przejdź do wyniku" : "Oczekuje na płatność") +
      stat("Tryb", mode) +
      "</div>" +
      '<div class="row-actions">' +
      '<button class="btn primary" data-act="pay-open">1. Otwórz stronę płatności</button>' +
      '<button class="btn gold" data-act="pay-confirm">2. Potwierdź i zobacz wynik</button>' +
      "</div>" +
      (P.configured() ? "" :
        '<p class="small err">Uzupełnij endpointy backendu poniżej, aby włączyć prawdziwe płatności. ' +
        "W trybie testowym potwierdzenie otwiera wynik bez opłaty.</p>") +
      "</section>" +
      '<section class="panel"><h3>Jak to działa</h3><p class="small muted">' +
      "1. Kliknij „Otwórz stronę płatności” — przejdziesz do Przelewy24. " +
      "2. Po zapłacie wróć tutaj i kliknij „Potwierdź i zobacz wynik”. " +
      "Serwer weryfikuje transakcję, a dopiero potem wyświetlany jest wynik. " +
      "Jedna opłata uprawnia do jednego raportu PDF.</p></section>" +
      '<details class="panel pay-config"><summary>Konfiguracja bramki (dla właściciela)</summary>' +
      '<p class="small muted">Wklej adresy własnego backendu. Dane merchantId, posId, CRC i klucz API ' +
      "nigdy nie są zapisywane w tej statycznej stronie — zostają po stronie serwera.</p>" +
      '<div class="grid">' +
      '<div class="field wide"><label class="field-label">createUrl (rejestracja transakcji)</label>' +
      '<input type="url" id="p-create" placeholder="https://twoj-backend.example/p24/create" value="' +
      esc(cfg.createUrl) + '"></div>' +
      '<div class="field wide"><label class="field-label">verifyUrl (potwierdzenie zapłaty)</label>' +
      '<input type="url" id="p-verify" placeholder="https://twoj-backend.example/p24/verify" value="' +
      esc(cfg.verifyUrl) + '"></div>' +
      '<label class="checkline wide"><input type="checkbox" id="p-sandbox"' +
      (cfg.sandbox !== false ? " checked" : "") + "><span>Tryb sandbox (testowy) Przelewy24</span></label>" +
      "</div>" +
      '<div class="row-actions"><button class="btn primary" data-act="pay-config-save">Zapisz konfigurację</button>' +
      '<button class="btn" data-act="pay-config-clear">Wyczyść</button></div>' +
      "</details>";
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
      stat("Wynik + PDF", P.PRICE_ZL + " zł · Przelewy24") +
      stat("Autor", "Rami Nassar") +
      stat("Firma", "BIM architects & consultants") +
      stat("Kontakt", "raminassar.arch@gmail.com") +
      "</div>" +
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

  /** Wynik i podgląd są dostępne wyłącznie po opłaceniu bieżącej sesji. */
  function paidSession() {
    const session = P.currentSession();
    return session && P.isPaid(session) ? session : null;
  }

  function render() {
    if (!project) project = loadProject();
    let head = route()[0];
    if (head === "eksport") { go("platnosc"); return; }
    if ((head === "wynik" || head === "podglad") && !paidSession()) {
      go("platnosc");
      return;
    }

    let html = "";
    if (head === "dane") html = viewDane();
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
      previewPages = await window.PVPdf.renderPreview(currentResult(), canvas);
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
      const bytes = await window.PVPdf.renderPdf(currentResult());
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
        P.confirmTest(session);
      }
    }
    toast("Płatność potwierdzona — przygotowujemy wynik.", "ok");
    go("wynik");
  }

  function savePaymentConfig() {
    const createInput = $("#p-create"), verifyInput = $("#p-verify"), sandboxInput = $("#p-sandbox");
    if (!createInput || !verifyInput) return;
    P.saveConfig({
      createUrl: createInput.value.trim(),
      verifyUrl: verifyInput.value.trim(),
      sandbox: !!sandboxInput.checked,
    });
    toast("Konfiguracja bramki zapisana lokalnie.", "ok");
    render();
  }

  function clearPaymentConfig() {
    P.clearConfig();
    toast("Konfiguracja bramki usunięta — tryb testowy.", "ok");
    render();
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
      '<span class="chip pay">Wynik 30 zł</span>' +
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
      else if (act === "pay-config-save") savePaymentConfig();
      else if (act === "pay-config-clear") clearPaymentConfig();
      else if (act === "pdf") doPdf();
    });

    document.addEventListener("change", function (e) {
      if (e.target && (e.target.id === "f-place" || e.target.id === "f-protected")) readForm();
    });
    document.addEventListener("input", function (e) {
      if (e.target && (e.target.id === "f-ha" || e.target.id === "f-kw")) readForm();
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
