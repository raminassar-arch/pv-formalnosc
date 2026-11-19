/* ==========================================================================
   PV Formalność — wersja web 2.0.0
   payment.js — bramka Przelewy24: 30 zł za jeden raport PDF.

   Szkielet z placeholderami. Dane merchantId / posId / CRC / klucz API nigdy
   nie trafiają do statycznej strony — zostają po stronie backendu, który
   udostępnia dwa endpointy:

     POST createUrl  ->  {"url": "https://...przelewy24.pl/tranzakcja/TOKEN"}
     POST verifyUrl  ->  {"paid": true}

   Endpointy wpisuje właściciel przez API PVPayment.saveConfig (localStorage).
   Bez nich bramka działa w trybie testowym — nie pobiera pieniędzy.

   BUDOWA TESTOWA: TEST_MODE = true — wynik, podgląd i PDF są dostępne bez
   opłaty. Powrót do bramki 30 zł: ustawić TEST_MODE = false i skonfigurować
   własny backend (createUrl / verifyUrl). Panel konfiguracji został usunięty
   z interfejsu — zostaje tylko API.

   Jeden sessionId = jeden PDF. Sesja jest zużywana po pobraniu pliku.
   ========================================================================== */
(function (root) {
  "use strict";

  var CONFIG_KEY = "pvformalnosc.payment.config.v1";
  var STATE_KEY = "pvformalnosc.payment.state.v1";
  var PRICE_ZL = 30;
  var PRICE_GROSZE = 3000;
  var CURRENCY = "PLN";
  // Wersja testowa — dostęp bez opłaty. false = wymagana opłata 30 zł i backend.
  var TEST_MODE = true;
  var CHECKOUT_SANDBOX = "https://sandbox.przelewy24.pl/tranzakcja/";
  var CHECKOUT_LIVE = "https://www.przelewy24.pl/tranzakcja/";

  var DEFAULTS = { createUrl: "", verifyUrl: "", sandbox: true };
  var REQUIRED = ["createUrl", "verifyUrl"];

  function clone(obj) {
    var out = {};
    Object.keys(obj).forEach(function (k) { out[k] = obj[k]; });
    return out;
  }

  function read(key, fallback) {
    try {
      var raw = root.localStorage.getItem(key);
      if (!raw) return clone(fallback);
      var data = JSON.parse(raw);
      return data && typeof data === "object" ? data : clone(fallback);
    } catch (err) { return clone(fallback); }
  }

  function write(key, value) {
    try { root.localStorage.setItem(key, JSON.stringify(value)); }
    catch (err) { /* brak pamięci — stan zostaje w bieżącej sesji */ }
  }

  function config() {
    var cfg = clone(DEFAULTS);
    var saved = read(CONFIG_KEY, DEFAULTS);
    REQUIRED.concat(["sandbox"]).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(saved, key)) cfg[key] = saved[key];
    });
    cfg.sandbox = cfg.sandbox !== false;
    return cfg;
  }

  function configured() {
    var cfg = config();
    return REQUIRED.every(function (key) {
      return String(cfg[key] || "").trim().length > 0;
    });
  }

  function saveConfig(values) {
    var cfg = clone(DEFAULTS);
    Object.keys(cfg).forEach(function (key) {
      if (values && Object.prototype.hasOwnProperty.call(values, key)) cfg[key] = values[key];
    });
    write(CONFIG_KEY, cfg);
    return cfg;
  }

  function clearConfig() {
    try { root.localStorage.removeItem(CONFIG_KEY); } catch (err) { /* ignore */ }
  }

  function state() {
    var data = read(STATE_KEY, { Current: null, Paid: [] });
    return {
      Current: data.Current || null,
      Paid: Array.isArray(data.Paid) ? data.Paid : [],
    };
  }

  function saveState(s) { write(STATE_KEY, s); }

  function uid() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID().replace(/-/g, "");
    }
    var out = "";
    for (var i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
  }

  function newSession() {
    var s = state();
    s.Current = uid();
    saveState(s);
    return s.Current;
  }

  function currentSession() { return state().Current; }

  function checkoutUrl(sessionId) {
    var base = config().sandbox ? CHECKOUT_SANDBOX : CHECKOUT_LIVE;
    if (!configured()) return base + "CONFIGURE-ME-" + String(sessionId).slice(0, 8);
    return base + "TOKEN-" + String(sessionId).slice(0, 12);
  }

  function postJson(url, payload) {
    if (!root.fetch) return Promise.reject(new Error("Brak obsługi fetch w tej przeglądarce."));
    return root.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (resp) {
      if (!resp.ok) throw new Error("Błąd odpowiedzi serwera: " + resp.status);
      return resp.json();
    });
  }

  function registerPayment(sessionId) {
    var cfg = config();
    if (!configured()) return Promise.resolve(checkoutUrl(sessionId));
    return postJson(cfg.createUrl, {
      sessionId: sessionId,
      amount: PRICE_GROSZE,
      currency: CURRENCY,
      description: "PV Formalność — raport PDF",
      sandbox: !!cfg.sandbox,
    }).then(function (data) {
      return data.url || data.redirectUrl || checkoutUrl(sessionId);
    }).catch(function () {
      return checkoutUrl(sessionId);
    });
  }

  function verify(sessionId) {
    var cfg = config();
    if (!configured()) return Promise.resolve(false);
    return postJson(cfg.verifyUrl, {
      sessionId: sessionId,
      amount: PRICE_GROSZE,
    }).then(function (data) {
      return !!(data && (data.paid || data.ok));
    }).catch(function () { return false; });
  }

  function confirmTest(sessionId) {
    if (configured()) return false;
    var s = state();
    if (s.Paid.indexOf(sessionId) < 0) s.Paid.push(sessionId);
    s.Current = sessionId;
    saveState(s);
    return true;
  }

  function markPaid(sessionId) {
    var s = state();
    if (s.Paid.indexOf(sessionId) < 0) s.Paid.push(sessionId);
    s.Current = sessionId;
    saveState(s);
  }

  function isPaid(sessionId) {
    return !!sessionId && state().Paid.indexOf(sessionId) >= 0;
  }

  function consume(sessionId) {
    var s = state();
    s.Paid = s.Paid.filter(function (id) { return id !== sessionId; });
    if (s.Current === sessionId) s.Current = null;
    saveState(s);
  }

  function reset() {
    try { root.localStorage.removeItem(STATE_KEY); } catch (err) { /* ignore */ }
  }

  root.PVPayment = {
    PRICE_ZL: PRICE_ZL,
    PRICE_GROSZE: PRICE_GROSZE,
    CURRENCY: CURRENCY,
    isTestMode: function () { return TEST_MODE; },
    CHECKOUT_SANDBOX: CHECKOUT_SANDBOX,
    CHECKOUT_LIVE: CHECKOUT_LIVE,
    config: config,
    configured: configured,
    saveConfig: saveConfig,
    clearConfig: clearConfig,
    newSession: newSession,
    currentSession: currentSession,
    checkoutUrl: checkoutUrl,
    registerPayment: registerPayment,
    verify: verify,
    confirmTest: confirmTest,
    markPaid: markPaid,
    isPaid: isPaid,
    consume: consume,
    reset: reset,
  };
})(window);
