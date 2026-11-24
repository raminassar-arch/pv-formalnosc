/* ==========================================================================
   Formalność OZE — wersja web
   pdf.js — eksport PDF 1.4 w 300 DPI, bez drukarki i bez serwera.

   Strona A4 jest rasteryzowana do 2480 x 3508 px (300 DPI), zapisywana jako
   JPEG i składana do pliku PDF z filtrem /DCTDecode — dokładnie tak samo jak
   w pv_formalnosc/pdf_export.py. Layout jest wyrażony w jednostkach
   projektowych (150 DPI) i skalowany ctx.scale(2, 2).
   ========================================================================== */
(function (root) {
  "use strict";

  const M = root.PVModel;
  const PAGE_W = 595.28, PAGE_H = 841.89;
  const W = 1240, H = 1754, MARGIN = 90;   // jednostki projektowe (150 DPI)
  const S = 2;                              // 150 -> 300 DPI
  const PXW = W * S, PXH = H * S;

  // Wersja testowa — znak wodny na każdej stronie (również w podglądzie A4).
  // Znika automatycznie po ustawieniu TEST_MODE = false w js/payment.js.
  const TEST_BUILD = !!(root.PVPayment && root.PVPayment.isTestMode &&
                        root.PVPayment.isTestMode());
  const WATERMARK_LINES = ["BIM ARCHITECTS & CONSULTANTS", "WERSJA TESTOWA"];
  const WATERMARK = WATERMARK_LINES.join("\n");

  /** Trzy wyglądy tego samego raportu. Identyczna treść i układ A4. */
  const THEMES = [
    { id: "simple",  name: "Biały — prosty i czytelny" },
    { id: "cards",   name: "Karty — sekcje w ramkach" },
    { id: "premium", name: "Premium — ciemnogranatowo-złoty" },
  ];

  const PALETTES = {
    simple: {
      id: "simple",
      PAGE_BG: "#FFFFFF", BEST_BG: "#F2F5F7", BEST_INK: "#13263A",
      PRIMARY: "#FFFFFF", ON_PRIMARY: "#13263A", HEADER_SUB: "#5A6B7B",
      INK: "#13263A", BODY_INK: "#33485B", MUTED: "#5A6B7B", CELL: "#13263A",
      NEED: "#9A4A1A", FREE: "#146547",
      NEED_BG: "#FFFFFF", FREE_BG: "#FFFFFF",
      WARN_BG: "#FFFFFF", WARN_LINE: "#9A6B12",
      TABLE_HEAD_BG: "#FFFFFF", RULE: "#C8D0D6", ACCENT: "#13263A",
      CARD_BG: "#FFFFFF", CARD_LINE: "#C8D0D6", CARD_ACCENT: "#13263A",
    },
    cards: {
      id: "cards",
      PAGE_BG: "#F7FAF7", BEST_BG: "#E8F5EC", BEST_INK: "#0F7A4B",
      PRIMARY: "#14563F", ON_PRIMARY: "#FFFFFF", HEADER_SUB: "#D8E8D9",
      INK: "#16241C", BODY_INK: "#33485B", MUTED: "#5F7268", CELL: "#14563F",
      NEED: "#A34B18", FREE: "#0F7A4B",
      NEED_BG: "#FDF1E7", FREE_BG: "#E8F5EC",
      WARN_BG: "#FFF6DA", WARN_LINE: "#D9B45A",
      TABLE_HEAD_BG: "#EAF3EB", RULE: "#D6E4D8", ACCENT: "#1E6B50",
      CARD_BG: "#F7FAF7", CARD_LINE: "#D6E4D8", CARD_ACCENT: "#1E6B50",
    },
    premium: {
      id: "premium",
      PAGE_BG: "#F5F8FC", BEST_BG: "#E7F5EE", BEST_INK: "#0F2742",
      PRIMARY: "#0F2742", ON_PRIMARY: "#FFFFFF", HEADER_SUB: "#B9CFDC",
      INK: "#13263A", BODY_INK: "#33485B", MUTED: "#5A6B7B", CELL: "#0F2742",
      NEED: "#B4531A", FREE: "#0F7A4B",
      NEED_BG: "#FCEEE4", FREE_BG: "#E7F5EE",
      WARN_BG: "#FFF6DA", WARN_LINE: "#D9B45A",
      TABLE_HEAD_BG: "#EDF2F7", RULE: "#CBD6DE", ACCENT: "#2E7FB8",
      CARD_BG: "#FFFFFF", CARD_LINE: "#CBD6DE", CARD_ACCENT: "#0F2742",
    },
  };

  function palette(id) { return PALETTES[id] || PALETTES.premium; }

  function fontPx(pt) { return Math.max(8, Math.round(pt * 150 / 72)); }
  function fontDef(pt, bold) {
    return `${fontPx(pt)}px "${bold ? "DejaVu-Bold" : "DejaVu"}", sans-serif`;
  }

  /** Przezroczysty, przekątny znak wodny pod treścią raportu — dwie linie. */
  function drawWatermark(ctx, color) {
    if (!WATERMARK_LINES.length) return;
    const size = 56;
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = color || "#0F2742";
    ctx.font = `bold ${size}px "DejaVu", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 6);
    WATERMARK_LINES.forEach(function (line, i) {
      ctx.fillText(line, 0, (i - (WATERMARK_LINES.length - 1) / 2) * (size + 14));
    });
    ctx.restore();
  }

  let fontsReady = false;
  async function ensureFonts() {
    if (fontsReady || typeof document === "undefined" || !document.fonts) return;
    const list = [["DejaVu", "assets/DejaVuSans.ttf"],
                  ["DejaVu-Bold", "assets/DejaVuSans-Bold.ttf"]];
    for (const pair of list) {
      try {
        if (!document.fonts.check(`16px "${pair[0]}"`)) {
          const face = new FontFace(pair[0], `url("${pair[1]}")`);
          await face.load();
          document.fonts.add(face);
        }
      } catch (err) {
        // Brak fontu DejaVu -> przeglądarka użyje sans-serif (także polskie znaki).
      }
    }
    fontsReady = true;
  }

  function Doc(theme) {
    this.c = palette(theme);
    this.pages = [];
    this.newPage();
    this.f = {
      title: fontDef(16, true), sub: fontDef(9), h2: fontDef(12, true),
      h3: fontDef(11, true), body: fontDef(10), small: fontDef(9),
      big: fontDef(18, true), num: fontDef(12, true),
    };
  }

  Doc.prototype.newPage = function () {
    const canvas = document.createElement("canvas");
    canvas.width = PXW; canvas.height = PXH;
    const ctx = canvas.getContext("2d");
    ctx.scale(S, S);
    ctx.textBaseline = "top";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);
    drawWatermark(ctx);
    this.pages.push({ canvas: canvas, ctx: ctx });
    this.ctx = ctx;
    this.y = MARGIN;
  };

  Doc.prototype.ensure = function (height) {
    if (this.y + height > H - MARGIN) this.newPage();
  };

  Doc.prototype.text = function (value, font, fill, x, y) {
    this.ctx.font = font;
    this.ctx.fillStyle = fill;
    this.ctx.fillText(String(value === undefined || value === null ? "" : value),
                      Math.round(x), Math.round(y));
  };

  Doc.prototype.wrapped = function (text, font, fill, x, maxWidth, lineHeight) {
    const ctx = this.ctx;
    ctx.font = font;
    String(text).split("\n").forEach((para) => {
      const words = para.split(" ").filter((w) => w.length > 0);
      if (!words.length) { this.ensure(lineHeight); this.y += lineHeight; return; }
      let line = "";
      words.forEach((word) => {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          this.ensure(lineHeight);
          this.text(line, font, fill, x, this.y);
          this.y += lineHeight;
          line = word;
        } else {
          line = test;
        }
      });
      if (line) {
        this.ensure(lineHeight);
        this.text(line, font, fill, x, this.y);
        this.y += lineHeight;
      }
    });
  };

  /** Liczba linii po zawijaniu — do wyliczenia wysokości karty przed rysowaniem. */
  Doc.prototype.countLines = function (text, font, maxWidth) {
    const ctx = this.ctx;
    ctx.font = font;
    let count = 0;
    String(text).split("\n").forEach((para) => {
      const words = para.split(" ").filter((w) => w.length > 0);
      if (!words.length) { count++; return; }
      let line = "";
      words.forEach((word) => {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          count++; line = word;
        } else { line = test; }
      });
      if (line) count++;
    });
    return Math.max(1, count);
  };

  Doc.prototype.rule = function (y) {
    const ctx = this.ctx;
    ctx.strokeStyle = this.c.RULE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(W - MARGIN, y);
    ctx.stroke();
  };

  /** Tło sekcji w stylu „Karty"; w pozostałych motywach nie rysuje nic. */
  Doc.prototype.cardRect = function (startY, height) {
    if (this.c.id !== "cards") return;
    const ctx = this.ctx, x = MARGIN - 20, w = W - 2 * MARGIN + 40;
    ctx.fillStyle = this.c.CARD_BG;
    ctx.fillRect(x, startY, w, height);
    ctx.strokeStyle = this.c.CARD_LINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, startY, w, height);
    ctx.fillStyle = this.c.CARD_ACCENT;
    ctx.fillRect(x, startY, 5, height);
  };

  Doc.prototype.sectionTitle = function (text, advance) {
    if (this.c.id === "cards") {
      this.ctx.fillStyle = this.c.CARD_ACCENT;
      this.ctx.fillRect(MARGIN - 20, this.y, 5, 24);
    }
    this.text(text, this.f.h2, this.c.CELL, MARGIN, this.y);
    if (this.c.id === "simple") this.rule(this.y + 26);
    this.y += advance;
  };

  Doc.prototype.verdictBox = function (x, y, w, need, title, desc) {
    const c = this.c;
    if (c.id !== "simple") {
      this.ctx.fillStyle = need ? c.NEED_BG : c.FREE_BG;
      this.ctx.fillRect(x, y, w, 140);
    }
    this.ctx.strokeStyle = need ? c.NEED : c.FREE;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, w, 140);
    this.ctx.fillStyle = need ? c.NEED : c.FREE;
    this.ctx.fillRect(x, y, 8, 140);
    this.text(title, this.f.h3, c.INK, x + 22, y + 12);
    this.text(need ? "TAK" : "NIE", this.f.big, need ? c.NEED : c.FREE, x + 22, y + 38);
    const saved = this.y;
    this.y = y + 88;
    this.wrapped(desc, this.f.small, c.MUTED, x + 22, w - 40, 17);
    this.y = saved;
  };

  Doc.prototype.estimateSection = function (e) {
    const f = this.f, c = this.c;
    const source = e.presetName + " · " + M.COST_SOURCE_LINE;
    const srcLines = this.countLines(source, f.small, W - 2 * MARGIN);
    const noteLines = this.countLines(e.powerNote, f.small, W - 2 * MARGIN);
    const height = 10 + 28 + srcLines * 16 + 8 + 9 * 24 + 6 + noteLines * 16 + 8;
    this.ensure(height + 20);
    this.cardRect(this.y, height + 6);
    this.y += 10;
    this.sectionTitle("Wycena i czas realizacji", 28);
    this.wrapped(source, f.small, c.MUTED, MARGIN, W - 2 * MARGIN, 16);
    this.y += 8;

    const row = (label, value, strong) => {
      this.text(label, f.body, c.MUTED, MARGIN, this.y);
      this.text(value, strong ? f.h3 : f.body, strong ? c.CELL : c.INK,
                MARGIN + 330, this.y);
      this.y += 24;
    };
    row("Liczba paneli (moc i powierzchnia)", e.panels + " szt.");
    row("Powierzchnia użyteczna", M.fmt(e.usableAreaM2) + " m²");
    row("Moc z liczby paneli", M.fmt(e.installedKw) + " kW");
    row("Koszt modułów", M.money(e.moduleZl));
    row("Konstrukcja, falownik, osprzęt", M.money(e.bosZl));
    row("Koszt materiałów", M.money(e.materialZl));
    row("Koszt wykonania (robocizna)", M.money(e.laborZl));
    row("RAZEM", M.money(e.totalZl), true);
    row("Czas realizacji",
        e.days + " dni roboczych (" + e.panelsPerDay + " paneli/dzień)");
    this.y += 6;
    this.wrapped(e.powerNote, f.small, c.MUTED, MARGIN, W - 2 * MARGIN, 16);
    this.y += 8;
  };

  Doc.prototype.optimizerSection = function (o) {
    if (!o || !o.list || !o.list.length) return;
    const f = this.f, c = this.c, ctx = this.ctx;
    const fit = (value, maxWidth) => {
      let s = String(value);
      if (ctx.measureText(s).width <= maxWidth) return s;
      while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) {
        s = s.slice(0, -1);
      }
      return s + "…";
    };

    const rec = o.recommended;
    const noteLines = this.countLines(o.note, f.small, W - 2 * MARGIN);
    const height = 10 + 28 + noteLines * 16 + (rec ? 8 + 32 : 0) +
                   28 + o.list.length * 24 + 8;
    this.ensure(height + 20);
    this.cardRect(this.y, height + 6);
    this.y += 10;
    this.sectionTitle("Najtańszy wariant — dobór modułu i mocy", 28);
    this.wrapped(o.note, f.small, c.MUTED, MARGIN, W - 2 * MARGIN, 16);
    if (rec) {
      this.y += 8;
      this.text("Rekomendacja: " + rec.name + " · " + rec.panels + " szt. · " +
                M.fmt(rec.installedKw) + " kW · " + M.money(rec.totalZl),
                f.body, c.CELL, MARGIN, this.y);
      this.y += 32;
    }

    const cols = [MARGIN, MARGIN + 430, MARGIN + 520, MARGIN + 630, MARGIN + 840];
    const areaHead = o.mode === "both" ? "Pow. · z mocy/pow."
      : o.mode === "power" ? "Pow. wymagana" : "Pow. zajęta";
    const heads = ["Moduł", "Panele", "Moc", areaHead, "Razem"];
    ctx.fillStyle = c.TABLE_HEAD_BG;
    ctx.fillRect(MARGIN, this.y - 4, W - 2 * MARGIN, 24);
    ctx.font = f.small;
    heads.forEach((h, i) => this.text(fit(h, i === 0 ? 415 : 100), f.small,
                                      c.CELL, cols[i], this.y));
    this.rule(this.y + 21);
    this.y += 28;

    o.list.forEach(function (x) {
      const best = rec && x.id === rec.id;
      const areaText = o.mode === "both"
        ? M.fmt(x.neededHa) + " ha · " + x.powerPanels + "/" + x.areaPanels
        : o.mode === "power"
          ? (x.fitsArea ? M.fmt(x.neededHa) + " ha" : "za dużo")
          : M.fmt(x.neededM2) + " m²";
      ctx.font = f.small;
      this.text(fit(x.rank + ". " + x.name + " " + M.fmt(x.wp) + " Wp", 415),
                f.small, best ? c.CELL : c.INK, cols[0], this.y);
      this.text(x.panels + " szt.", f.small, c.INK, cols[1], this.y);
      this.text(M.fmt(x.installedKw) + " kW", f.small, c.INK, cols[2], this.y);
      this.text(fit(areaText, 100), f.small, c.INK, cols[3], this.y);
      this.text(fit(M.money(x.totalZl), 145), f.small, best ? c.CELL : c.INK,
                cols[4], this.y);
      this.y += 24;
    }, this);
    this.y += 8;
  };

  Doc.prototype.render = function (r, e, o) {
    const f = this.f, c = this.c;
    if (!e) e = M.estimate(r.ha, r.kw);
    if (!o) o = M.optimize("both", r.ha, r.kw);

    if (c.id !== "simple") {
      this.ctx.fillStyle = c.PRIMARY;
      this.ctx.fillRect(0, 0, W, 130);
    }
    this.text("Formalność OZE — raport", f.title,
              c.ON_PRIMARY, MARGIN, 26);
    this.text(`Wynik analizy · wersja ${M.VERSION} · ${M.todayPl()}`,
              f.sub, c.HEADER_SUB, MARGIN, 80);
    if (c.id === "simple") this.rule(118);

    this.y = 165;
    const inputHeight = 10 + 34 + 4 * 28 + 16 + 56 + 12 + 8;
    this.ensure(inputHeight + 20);
    this.cardRect(this.y, inputHeight);
    this.sectionTitle("Dane wejściowe", 34);

    const pair = (label, value) => {
      this.text(label, f.body, c.MUTED, MARGIN, this.y);
      this.text(value, f.body, c.INK, MARGIN + 250, this.y);
      this.y += 28;
    };
    pair("Miejsce montażu", r.place_text);
    pair("Lokalizacja", r.location_text);
    pair("Powierzchnia", M.fmt(r.ha) + " ha");
    pair("Moc", M.fmt(r.kw) + " kW");
    this.y += 16;
    this.text("Parametry stałe (nieedytowalne w formularzu)", f.small, c.MUTED,
              MARGIN, this.y);
    this.y += 20;
    this.wrapped(
      e.presetName + " · " + M.fmt(e.options.panelWp) + " Wp · " +
      M.fmt(e.options.panelAreaM2) + " m² · pokrycie " +
      M.fmt(e.options.coveragePct) + "% · moduł " +
      M.money(e.options.modulePriceZl) + "/szt. · BOS " +
      M.money(e.options.bosPerPanelZl) + "/panel · robocizna " +
      M.money(e.options.laborPerPanelZl) + "/panel · " +
      e.options.panelsPerDay + " paneli/dzień",
      f.small, c.INK, MARGIN, W - 2 * MARGIN, 18);
    this.y += 12;

    this.ensure(160);
    const boxW = (W - 2 * MARGIN - 24) / 2;
    this.verdictBox(MARGIN, this.y, boxW, r.env, "Decyzja środowiskowa", r.env_desc);
    this.verdictBox(MARGIN + boxW + 24, this.y, boxW, r.perm,
                    "Pozwolenie na budowę", r.perm_desc);
    this.y += 140;

    this.ensure(60);
    this.sectionTitle(`Ścieżka ${r.path_no}: ${r.path_name}`, 30);
    this.wrapped(r.path_meta, f.sub, c.MUTED, MARGIN, W - 2 * MARGIN, 20);
    this.y += 10;

    if (r.warning) {
      const saved = this.y;
      this.y += 12;
      if (c.id !== "simple") {
        this.ctx.fillStyle = c.WARN_BG;
        this.ctx.fillRect(MARGIN, saved, W - 2 * MARGIN, 58);
      }
      this.ctx.strokeStyle = c.WARN_LINE;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(MARGIN, saved, W - 2 * MARGIN, 58);
      this.wrapped(r.warning, f.small, c.INK, MARGIN + 20, W - 2 * MARGIN - 40, 18);
      this.y = saved + 68;
    }

    this.ensure(36);
    this.sectionTitle("Kroki w kolejności", 36);

    r.steps.forEach((step, i) => {
      this.ctx.font = f.small;
      const lines = this.countLines(step.desc, f.small, W - 2 * MARGIN - 70);
      const descHeight = 60 + 18 * lines;
      this.ensure(descHeight + 20);
      this.cardRect(this.y, descHeight + 12);
      const cx = MARGIN + 15, cy = this.y + 15;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, 15, 0, 2 * Math.PI);
      if (c.id === "simple") {
        this.ctx.strokeStyle = c.ACCENT;
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      } else {
        this.ctx.fillStyle = c.ACCENT;
        this.ctx.fill();
      }
      const num = String(i + 1);
      this.ctx.font = f.num;
      const nw = this.ctx.measureText(num).width;
      this.text(num, f.num, c.id === "simple" ? c.ACCENT : c.ON_PRIMARY,
                MARGIN + (30 - nw) / 2, this.y + 2);
      this.text(step.name, f.h3, c.INK, MARGIN + 44, this.y);
      this.y += 34;
      this.wrapped(step.desc, f.small, c.BODY_INK,
                   MARGIN + 44, W - 2 * MARGIN - 70, 18);
      this.y += 16;
    });

    this.estimateSection(e);
    this.optimizerSection(o);

    this.ensure(90);
    this.rule(this.y);
    this.y += 12;
    [M.SOURCE_LINE, M.DISCLAIMER, M.AUTHOR_LINE].forEach((line) => {
      this.wrapped(line, f.small, c.MUTED, MARGIN, W - 2 * MARGIN, 17);
    });
  };

  // --- zapis PDF -----------------------------------------------------------

  function ByteWriter() {
    this.chunks = [];
    this.length = 0;
  }
  ByteWriter.prototype.ascii = function (text) {
    const b = new TextEncoder().encode(text);
    this.chunks.push(b); this.length += b.length; return this;
  };
  ByteWriter.prototype.bytes = function (arr) {
    this.chunks.push(arr); this.length += arr.length; return this;
  };
  ByteWriter.prototype.offset = function () { return this.length; };
  ByteWriter.prototype.out = function () {
    const out = new Uint8Array(this.length);
    let pos = 0;
    this.chunks.forEach((part) => { out.set(part, pos); pos += part.length; });
    return out;
  };

  function buildPdf(images) {
    const w = new ByteWriter();
    const n = images.length;
    const maxObj = 5 + 3 * (n - 1);
    const offsets = new Array(maxObj + 1).fill(0);

    w.ascii("%PDF-1.4\n");
    const obj = (num, body) => {
      offsets[num] = w.offset();
      w.ascii(`${num} 0 obj\n${body}\nendobj\n`);
    };
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    const kids = images.map((_, i) => `${3 + 3 * i} 0 R`).join(" ");
    obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);

    images.forEach((img, i) => {
      const pageObj = 3 + 3 * i, imgObj = 4 + 3 * i, contentNum = 5 + 3 * i;
      obj(pageObj,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] ` +
        `/Resources << /XObject << /Im0 ${imgObj} 0 R >> >> /Contents ${contentNum} 0 R >>`);
      offsets[imgObj] = w.offset();
      w.ascii(`${imgObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} ` +
              `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
              `/Length ${img.bytes.length} >>\nstream\n`);
      w.bytes(img.bytes);
      w.ascii("\nendstream\nendobj\n");
      const content = `q\n${PAGE_W.toFixed(2)} 0 0 ${PAGE_H.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
      obj(contentNum, `<< /Length ${content.length} >>\nstream\n${content}endstream`);
    });

    const xref = w.offset();
    w.ascii(`xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`);
    for (let i = 1; i <= maxObj; i++) {
      w.ascii(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
    }
    w.ascii(`trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return w.out();
  }

  function dataUrlBytes(dataUrl) {
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (typeof atob === "function") {
      const bin = atob(base64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  async function renderPdf(r, e, o, theme) {
    await ensureFonts();
    const doc = new Doc(theme);
    doc.render(r, e, o);
    const images = doc.pages.map((page) => ({
      bytes: dataUrlBytes(page.canvas.toDataURL("image/jpeg", 0.9)),
      w: PXW, h: PXH,
    }));
    return buildPdf(images);
  }

  /** Pierwsza strona tego samego układu, narysowana do widocznego canvasa. */
  async function renderPreview(r, target, e, o, theme) {
    await ensureFonts();
    const doc = new Doc(theme);
    doc.render(r, e, o);
    target.width = PXW;
    target.height = PXH;
    const ctx = target.getContext("2d");
    ctx.clearRect(0, 0, PXW, PXH);
    ctx.drawImage(doc.pages[0].canvas, 0, 0);
    return doc.pages.length;
  }

  root.PVPdf = {
    renderPdf: renderPdf,
    renderPreview: renderPreview,
    buildPdf: buildPdf,          // eksportowany też do testów Node
    ensureFonts: ensureFonts,
    dataUrlBytes: dataUrlBytes,
    themes: THEMES,
    themePalette: palette,
    drawWatermark: drawWatermark,
    watermark: WATERMARK,
    watermarkLines: WATERMARK_LINES,
    defaultTheme: "premium",
    constants: { W: W, H: H, S: S, PXW: PXW, PXH: PXH, PAGE_W: PAGE_W, PAGE_H: PAGE_H },
  };
})(typeof window !== "undefined" ? window : globalThis);
