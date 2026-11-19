/* ==========================================================================
   PV Formalność — wersja web
   license.js — licencja offline w przeglądarce.

   Reguły identyczne jak w pv_formalnosc/license.py (wersja desktopowa):
     - 14 dni okresu próbnego od pierwszego uruchomienia,
     - 1000 kluczy dożywotnich + 1000 rocznych,
     - klucz roczny wazny 365 dni od pierwszej aktywacji,
     - wyłącznie hashe SHA-256 (brak jawnych kluczy w kodzie).
   Stan jest zapisywany w localStorage. Nie ma tu rejestru Windows ani
   %LOCALAPPDATA% — to naturalna różnica wersji statycznej.
   ========================================================================== */
(function (root) {
  "use strict";

  const STORAGE_KEY = "pvformalnosc.license.v1";
  const TRIAL_DAYS = 14, YEAR_DAYS = 365;
  const DAY = 24 * 60 * 60 * 1000;

  function canon(value) {
    if (!value) return "";
    return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function format(value) {
    const c = canon(value);
    if (c.length !== 20) return c;
    return [0, 1, 2, 3].map((i) => c.slice(i * 5, (i + 1) * 5)).join("-");
  }

  function digest(canonical) {
    const data = new TextEncoder().encode(canonical);
    if (root.crypto && root.crypto.subtle) {
      return root.crypto.subtle.digest("SHA-256", data).then((buf) => {
        return Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0")).join("");
      });
    }
    // Fallback dla testów w Node (bez Web Crypto).
    const nodeCrypto = typeof require === "function" ? require("crypto") : null;
    if (nodeCrypto && nodeCrypto.createHash) {
      return Promise.resolve(nodeCrypto.createHash("sha256")
        .update(Buffer.from(data)).digest("hex"));
    }
    return Promise.reject(new Error("Brak implementacji SHA-256."));
  }

  let lifeSet = null, yearSet = null;
  function sets() {
    if (!lifeSet) {
      const K = root.PVKeys || { lifetime: [], year: [] };
      lifeSet = new Set(K.lifetime || []);
      yearSet = new Set(K.year || []);
    }
    return { life: lifeSet, year: yearSet };
  }

  async function validate(value) {
    const key = canon(value);
    if (key.length !== 20) {
      return { ok: false, kind: "", message: "Klucz musi składać się z 20 znaków (4 grupy po 5)." };
    }
    const hash = await digest(key);
    const s = sets();
    if (s.life.has(hash)) {
      return { ok: true, kind: "lifetime", message: "Klucz dożywotni — brak daty wygaśnięcia." };
    }
    if (s.year.has(hash)) {
      return { ok: true, kind: "year", message: "Klucz roczny — ważny 365 dni od pierwszej aktywacji." };
    }
    return { ok: false, kind: "", message: "Nieprawidłowy klucz licencyjny." };
  }

  function now() { return new Date(); }

  function blank() {
    const t = now().toISOString();
    return { FirstStartUtc: t, LastSeenUtc: t, Key: null, ActivatedUtc: null, Kind: null };
  }

  function load() {
    let state = blank();
    try {
      const raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === "object") {
          state = {
            FirstStartUtc: data.FirstStartUtc || state.FirstStartUtc,
            LastSeenUtc: data.LastSeenUtc || state.LastSeenUtc,
            Key: data.Key || null,
            ActivatedUtc: data.ActivatedUtc || null,
            Kind: data.Kind || null,
          };
        }
      }
    } catch (err) { /* uszkodzony zapis — zaczynamy od nowa */ }

    const current = now();
    const first = new Date(state.FirstStartUtc);
    const seen = new Date(state.LastSeenUtc);
    if (isNaN(first.getTime())) state.FirstStartUtc = current.toISOString();
    // Wykrycie cofnięcia zegara systemowego.
    if (!isNaN(seen.getTime()) && seen.getTime() > current.getTime() + DAY) {
      state.Key = null; state.Kind = null; state.ActivatedUtc = null;
    }
    state.LastSeenUtc = current.toISOString();
    save(state);
    return state;
  }

  function save(state) {
    try {
      if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) { /* brak pamięci — licencja działa w pamięci */ }
  }

  function activate(state, key, kind) {
    state.Key = canon(key);
    state.Kind = kind;
    state.ActivatedUtc = now().toISOString();
    save(state);
  }

  function isUsable(state) {
    const current = now().getTime();
    if (state.Key && state.ActivatedUtc) {
      if (state.Kind === "lifetime") return true;
      if (state.Kind === "year") {
        const end = new Date(state.ActivatedUtc).getTime() + YEAR_DAYS * DAY;
        return current <= end;
      }
    }
    const first = new Date(state.FirstStartUtc).getTime();
    return current <= first + TRIAL_DAYS * DAY;
  }

  function daysLeft(endIso) {
    const end = new Date(endIso).getTime();
    if (isNaN(end)) return 0;
    return Math.max(0, Math.ceil((end - now().getTime()) / DAY));
  }

  function trialDaysLeft(state) {
    return daysLeft(new Date(new Date(state.FirstStartUtc).getTime() + TRIAL_DAYS * DAY).toISOString());
  }

  function yearDaysLeft(state) {
    if (!state.ActivatedUtc) return 0;
    return daysLeft(new Date(new Date(state.ActivatedUtc).getTime() + YEAR_DAYS * DAY).toISOString());
  }

  function datePl(date) {
    const p = (v) => (v < 10 ? "0" : "") + v;
    return `${p(date.getDate())}.${p(date.getMonth() + 1)}.${date.getFullYear()}`;
  }

  function statusText(state) {
    if (state.Key && state.ActivatedUtc) {
      const key = format(state.Key);
      if (state.Kind === "lifetime") return `Licencja dożywotnia · ${key}`;
      if (state.Kind === "year") {
        const end = new Date(new Date(state.ActivatedUtc).getTime() + YEAR_DAYS * DAY);
        return `Licencja roczna · ${key} · ` +
          (isUsable(state) ? `ważna do ${datePl(end)}` : "WYGASŁA");
      }
    }
    const left = trialDaysLeft(state);
    return left > 0
      ? `Okres próbny · pozostało ${left} dni`
      : "Okres próbny zakończony — wymagany klucz";
  }

  function status(state) {
    const licensed = !!(state.Key && state.ActivatedUtc);
    let kind = "trial";
    if (licensed) kind = state.Kind === "lifetime" ? "lifetime" :
      (isUsable(state) ? "year" : "expired");
    else if (!isUsable(state)) kind = "expired";
    return {
      valid: isUsable(state),
      licensed: licensed,
      kind: kind,
      short: licensed ? (state.Kind === "lifetime" ? "DOŻYWOTNIA" : "ROCZNA") : "PRÓBKA",
      summary: statusText(state),
      trialDays: TRIAL_DAYS,
      trialDaysLeft: trialDaysLeft(state),
      yearDaysLeft: yearDaysLeft(state),
      key: state.Key ? format(state.Key) : "",
      activated: state.ActivatedUtc || "",
      firstStart: state.FirstStartUtc,
    };
  }

  root.PVLicense = {
    STORAGE_KEY: STORAGE_KEY,
    TRIAL_DAYS: TRIAL_DAYS,
    YEAR_DAYS: YEAR_DAYS,
    canon: canon,
    format: format,
    validate: validate,
    load: load,
    save: save,
    activate: activate,
    isUsable: isUsable,
    status: status,
    statusText: statusText,
    trialDaysLeft: trialDaysLeft,
    yearDaysLeft: yearDaysLeft,
    blank: blank,
  };
})(typeof window !== "undefined" ? window : globalThis);
