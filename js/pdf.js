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
  const CARD_GAP = 10;                      // luz między kolejnymi kartami
  const JPEG_QUALITY = 1;                   // maksymalna jakość obrazu w PDF

  // Wersja testowa — znak wodny na każdej stronie (również w podglądzie A4).
  // Znika automatycznie po ustawieniu TEST_MODE = false w js/payment.js.
  const TEST_BUILD = !!(root.PVPayment && root.PVPayment.isTestMode &&
                        root.PVPayment.isTestMode());
  const WATERMARK_LINES = ["BIM ARCHITECTS & CONSULTANTS", "WERSJA TESTOWA"];
  const WATERMARK = WATERMARK_LINES.join("\n");

  /** Pięć wyglądów tego samego raportu. Identyczna treść i układ A4. */
  const THEMES = [
    { id: "simple",  label: "Motyw 1", name: "Biały — prosty i czytelny" },
    { id: "cards",   label: "Motyw 2", name: "Karty — sekcje w ramkach" },
    { id: "premium", label: "Motyw 3", name: "Premium — ciemnogranatowo-złoty" },
    { id: "mono",    label: "Motyw 4", name: "Mono — czytelny krój o stałej szerokości" },
    { id: "wide",    label: "Motyw 5", name: "Wide — duży krój pisma" },
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
      TABLE_HEAD_BG: "#EDF2F7", RULE: "#CBD6DE", ACCENT: "#2E7FB8", GOLD: "#C8A45C",
      CARD_BG: "#FFFFFF", CARD_LINE: "#CBD6DE", CARD_ACCENT: "#0F2742",
    },
    mono: {
      id: "mono",
      PAGE_BG: "#FFFFFF", BEST_BG: "#EDF1F3", BEST_INK: "#243746",
      PRIMARY: "#354B5A", ON_PRIMARY: "#FFFFFF", HEADER_SUB: "#D4E0E6",
      INK: "#243746", BODY_INK: "#3D5362", MUTED: "#6A7C88", CELL: "#354B5A",
      NEED: "#9A4A1A", FREE: "#146547",
      NEED_BG: "#FFFFFF", FREE_BG: "#FFFFFF",
      WARN_BG: "#FFFFFF", WARN_LINE: "#9A6B12",
      TABLE_HEAD_BG: "#F2F5F7", RULE: "#BFCBD3", ACCENT: "#354B5A",
      CARD_BG: "#FFFFFF", CARD_LINE: "#BFCBD3", CARD_ACCENT: "#354B5A",
    },
    wide: {
      id: "wide",
      PAGE_BG: "#F7FAF8", BEST_BG: "#DFF3E9", BEST_INK: "#0B5940",
      PRIMARY: "#0C5946", ON_PRIMARY: "#FFFFFF", HEADER_SUB: "#CBE8DE",
      INK: "#102A22", BODY_INK: "#355148", MUTED: "#5C776E", CELL: "#0C5946",
      NEED: "#A34B18", FREE: "#0B734F",
      NEED_BG: "#FFF1E5", FREE_BG: "#E6F6EE",
      WARN_BG: "#FFF6DA", WARN_LINE: "#C79B32",
      TABLE_HEAD_BG: "#E9F4EF", RULE: "#C9DEE0", ACCENT: "#0C7A64",
      CARD_BG: "#FFFFFF", CARD_LINE: "#C9DEE0", CARD_ACCENT: "#0C5946",
    },
  };

  /** Kształty nadają motywom różny charakter: ostre kąty, karty, zaokrąglenia. */
  const SHAPES = {
    simple:  { radius: 0,  badge: "square",  cardFill: false, lineWidth: 1 },
    cards:   { radius: 16, badge: "circle",  cardFill: true,  lineWidth: 1 },
    premium: { radius: 26, badge: "rounded", cardFill: true,  lineWidth: 2 },
    mono:    { radius: 4,  badge: "square",  cardFill: false, lineWidth: 1 },
    wide:    { radius: 20, badge: "circle",  cardFill: true,  lineWidth: 2 },
  };

  function palette(id) { return PALETTES[id] || PALETTES.premium; }
  function shape(id) { return SHAPES[id] || SHAPES.premium; }

  /** Każdy motyw ma własną czcionkę i wielkość liter. */
  const FONT_STACKS = {
    simple:  { family: '"DejaVu", Arial, sans-serif', boldFamily: '"DejaVu-Bold", Arial, sans-serif', boldWeight: false, scale: 1.00, lineScale: 1.00 },
    cards:   { family: 'Georgia, "Times New Roman", serif', boldWeight: true, scale: 1.02, lineScale: 1.02 },
    premium: { family: 'Arial, Helvetica, sans-serif', boldWeight: true, scale: 1.03, lineScale: 1.03 },
    mono:    { family: 'Consolas, "Lucida Console", monospace', boldWeight: true, scale: 0.90, lineScale: 0.94 },
    wide:    { family: 'Tahoma, Verdana, sans-serif', boldWeight: true, scale: 1.05, lineScale: 1.05 },
  };

  function fontSpec(id) { return FONT_STACKS[id] || FONT_STACKS.premium; }
  function themeFont(id) { return fontSpec(id); }
  function fontPx(pt, theme) {
    return Math.max(8, Math.round(pt * 150 / 72 * fontSpec(theme).scale));
  }
  function fontDef(pt, bold, theme) {
    const spec = fontSpec(theme);
    const family = bold && spec.boldFamily ? spec.boldFamily : spec.family;
    return (bold && spec.boldWeight ? "bold " : "") + `${fontPx(pt, theme)}px ${family}`;
  }

  // Interlinia zawsze większa od wysokości czcionki — inaczej wiersze się zlewają.
  const LINE_BASE = { small: 20, sub: 20, body: 22, h3: 24, h2: 26, footer: 20 };
  const ROW_BASE = 24;
  const CONTENT_TOP = 165;
  const CONTENT_BOTTOM = H - MARGIN - 40;
  const FOOTER_WIDTH = W - 2 * MARGIN - 120; // miejsce na numer strony
  function lineHeightsFor(id) {
    const k = fontSpec(id).lineScale, out = {};
    Object.keys(LINE_BASE).forEach(function (key) {
      out[key] = Math.max(14, Math.round(LINE_BASE[key] * k));
    });
    return out;
  }
  function rowHeightFor(id) { return Math.max(20, Math.round(ROW_BASE * fontSpec(id).lineScale)); }
  const LINE = lineHeightsFor("premium");
  function lineHeight(key, id) {
    const l = lineHeightsFor(id);
    return l[key] || l.small;
  }

  /** Podział tekstu na wiersze przy zadanej czcionce i szerokości. */
  function wrapParts(ctx, text, font, maxWidth) {
    ctx.font = font;
    const parts = [];
    String(text).split("\n").forEach((para) => {
      const words = para.split(" ").filter((w) => w.length > 0);
      if (!words.length) { parts.push(""); return; }
      let line = "";
      words.forEach((word) => {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          parts.push(line); line = word;
        } else { line = test; }
      });
      if (line) parts.push(line);
    });
    return parts.length ? parts : [""];
  }

  /** Ścieżka prostokąta z promieniem narożnika (0 = ostre kąty). */
  function roundedRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (r === 0) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
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
    this.theme = theme;
    this.c = palette(theme);
    this.shape = shape(theme);
    this.line = lineHeightsFor(theme);
    this.row = rowHeightFor(theme);
    this.pages = [];
    this.newPage();
    this.f = {
      title: fontDef(16, true, theme), sub: fontDef(9, false, theme),
      h2: fontDef(12, true, theme), h3: fontDef(11, true, theme),
      body: fontDef(10, false, theme), small: fontDef(9, false, theme),
      big: fontDef(18, true, theme), num: fontDef(12, true, theme),
    };
    this.setFooter([]);
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
    this.y = this.headerArgs ? CONTENT_TOP : MARGIN;
    if (this.headerArgs) this.header(this.headerArgs[0], this.headerArgs[1]);
  };

  Doc.prototype.ensure = function (height) {
    if (this.y + height > this.contentBottom) this.newPage();
  };

  /** Rezerwuje miejsce na stopkę przed startem treści — bez nachodzenia na nią. */
  Doc.prototype.setFooter = function (lines) {
    const ctx = this.ctx, f = this.f;
    const list = lines || [];
    let count = 0;
    list.forEach(function (line) {
      count += wrapParts(ctx, line, f.small, FOOTER_WIDTH).length;
    });
    const block = count * this.line.footer;
    this.footerLines = list;
    this.footerTop = H - MARGIN - block - 8;
    this.contentBottom = Math.min(CONTENT_BOTTOM, this.footerTop - 24);
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
    return wrapParts(this.ctx, text, font, maxWidth).length;
  };

  /** Pełny tekst podzielony na wiersze — bez skracania wielokropkiem. */
  Doc.prototype.splitLines = function (text, font, maxWidth) {
    return wrapParts(this.ctx, text, font, maxWidth);
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

  /** Ramka/wypełnienie z narożnikami charakterystycznymi dla motywu. */
  Doc.prototype.box = function (x, y, w, h, fill, stroke, radius) {
    const ctx = this.ctx;
    const r = radius === undefined ? this.shape.radius : radius;
    if (fill) {
      ctx.fillStyle = fill;
      roundedRectPath(ctx, x, y, w, h, r);
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = this.shape.lineWidth;
      roundedRectPath(ctx, x, y, w, h, r);
      ctx.stroke();
    }
  };

  /** Tło sekcji: ostre prostokąty / zaokrąglone karty wg motywu. */
  Doc.prototype.cardRect = function (startY, height) {
    const ctx = this.ctx, x = MARGIN - 20, w = W - 2 * MARGIN + 40;
    const sh = this.shape;
    this.box(x, startY, w, height,
             sh.cardFill ? this.c.CARD_BG : null, this.c.CARD_LINE, sh.radius);
    ctx.fillStyle = this.c.CARD_ACCENT;
    if (sh.radius === 0) {
      ctx.fillRect(x, startY, 5, height);
    } else {
      roundedRectPath(ctx, x, startY, 10, height, Math.min(5, sh.radius));
      ctx.fill();
    }
  };

  Doc.prototype.sectionTitle = function (text, advance) {
    const ctx = this.ctx, sh = this.shape;
    if (sh.radius === 0) {
      this.rule(this.y + 26);
    } else if (this.c.id === "premium") {
      ctx.fillStyle = this.c.GOLD || this.c.CARD_ACCENT;
      roundedRectPath(ctx, MARGIN - 20, this.y + 3, 9, 20, 4);
      ctx.fill();
    } else {
      ctx.fillStyle = this.c.CARD_ACCENT;
      roundedRectPath(ctx, MARGIN - 20, this.y, 5, 24, 2);
      ctx.fill();
    }
    this.text(text, this.f.h2, this.c.CELL, MARGIN, this.y);
    this.y += advance;
  };

  /** Nagłówek powtarzany na każdej stronie (również przy podziale na strony). */
  Doc.prototype.header = function (title, subtitle) {
    const f = this.f, c = this.c;
    this.headerArgs = [title, subtitle];
    if (c.id !== "simple") {
      this.ctx.fillStyle = c.PRIMARY;
      this.ctx.fillRect(0, 0, W, 130);
    }
    this.text(title, f.title, c.ON_PRIMARY, MARGIN, 26);
    if (c.id === "premium") {
      this.ctx.font = f.sub;
      const pillW = this.ctx.measureText(subtitle).width + 24;
      this.ctx.fillStyle = c.GOLD;
      roundedRectPath(this.ctx, MARGIN - 12, 72, pillW, 26, 13);
      this.ctx.fill();
      this.text(subtitle, f.sub, c.PRIMARY, MARGIN, 77);
    } else {
      this.text(subtitle, f.sub, c.HEADER_SUB, MARGIN, 80);
    }
    if (c.id === "simple") this.rule(118);
  };

  /** Stopka na dole każdej strony; nie współdzieli już ruchomego y treści. */
  Doc.prototype.finish = function (lines) {
    const f = this.f, c = this.c;
    this.setFooter(lines);
    const list = this.footerLines, top = this.footerTop;
    this.pages.forEach(function (page, index) {
      this.ctx = page.ctx;
      this.rule(top - 14);
      let fy = top;
      list.forEach(function (line) {
        wrapParts(this.ctx, line, f.small, FOOTER_WIDTH).forEach(function (part) {
          this.text(part, f.small, c.MUTED, MARGIN, fy);
          fy += this.line.footer;
        }, this);
      }, this);
      if (this.pages.length > 1) {
        this.ctx.textAlign = "right";
        this.text(`strona ${index + 1} z ${this.pages.length}`,
                  f.small, c.MUTED, W - MARGIN, top);
        this.ctx.textAlign = "left";
      }
    }, this);
    return this.pages.length;
  };

  /** Karta decyzji — wysokość zależy od liczby wierszy opisu. */
  Doc.prototype.verdictBox = function (x, y, w, need, title, desc) {
    const c = this.c, sh = this.shape, ctx = this.ctx;
    const descLines = this.countLines(desc, this.f.small, w - 40);
    // Treść kończy się na y + 82 + wiersze opisu. Zostawiamy 12 px wewnątrz
    // karty, a kolejna sekcja dostaje osobny luz CARD_GAP.
    const height = 82 + descLines * this.line.small + 12;
    this.box(x, y, w, height,
             sh.cardFill ? (need ? c.NEED_BG : c.FREE_BG) : null,
             need ? c.NEED : c.FREE, sh.radius);
    ctx.fillStyle = need ? c.NEED : c.FREE;
    if (sh.radius === 0) {
      ctx.fillRect(x, y, 8, height);
    } else {
      roundedRectPath(ctx, x, y, 12, height, Math.min(6, sh.radius));
      ctx.fill();
    }
    this.text(title, this.f.h3, c.INK, x + 22, y + 12);
    this.text(need ? "TAK" : "NIE", this.f.big, need ? c.NEED : c.FREE, x + 22, y + 36);
    const saved = this.y;
    this.y = y + 82;
    this.wrapped(desc, this.f.small, c.MUTED, x + 22, w - 40, this.line.small);
    this.y = saved;
    return height;
  };

  Doc.prototype.estimateSection = function (e) {
    const f = this.f, c = this.c;
    // Źródła cen są w stopce. Powtarzanie długich adresów wydłuża sekcję
    // i wypycha ranking na drugą stronę A4.
    const source = e.selectionScope || e.presetName;
    const noteText = e.powerNote || "";
    const sourceLines = this.countLines(source, f.small, W - 2 * MARGIN);
    const noteLines = this.countLines(noteText, f.small, W - 2 * MARGIN);

    // Etykiety i wyniki są wyrównane do lewej w stałych kolumnach. Długie
    // nazwy i kwoty zawijają się do kolejnych wierszy — bez wielokropka.
    const labelWidth = 540, valueX = MARGIN + labelWidth;
    const valueMax = W - MARGIN - valueX, rows = [];
    const rowPad = Math.max(3, Math.round(this.line.body * 0.16));
    const addRow = (label, value, strong, divider) => {
      const valueFont = strong ? f.h3 : f.body;
      const valueLines = this.splitLines(value, valueFont, valueMax);
      const labelLines = this.splitLines(label, f.body, labelWidth);
      const valueLine = strong ? this.line.h3 : this.line.body;
      rows.push({
        labelLines: labelLines, valueLines: valueLines, valueFont: valueFont,
        valueLine: valueLine, valueX: valueX, strong: !!strong, divider: !!divider,
        height: Math.max(labelLines.length * this.line.body,
                         valueLines.length * valueLine) + rowPad +
                (divider ? 8 : 0),
      });
    };
    addRow("Panele [szt.] · moc [kW] · pow. [m²]",
      e.panels + " szt. · " + M.fmt(e.installedKw) + " kW · " +
      M.fmtArea(e.usableAreaM2) + " m²");
    addRow("Moduły [zł]", M.money(e.moduleZl));
    addRow("Konstrukcja / falownik / BOS [zł]", M.money(e.bosZl));
    addRow("Materiały (moduły + BOS) [zł]", M.money(e.materialZl), false, true);
    addRow("Robocizna [zł]", M.money(e.laborZl));
    addRow("RAZEM (moduły + BOS + robocizna) [zł]", M.money(e.totalZl), true, true);
    addRow("Czas realizacji", M.daysPl(e.days) + " (" + e.panelsPerDay +
      " paneli/dzień)", false, true);

    const rowsHeight = rows.reduce(function (sum, r) { return sum + r.height; }, 0);
    const height = 10 + this.line.h2 + sourceLines * this.line.small + 8 +
      rowsHeight + 6 + noteLines * this.line.small + CARD_GAP + 4;
    this.ensure(height + 20);
    this.cardRect(this.y, height - CARD_GAP);
    this.y += 10;
    this.sectionTitle("Wycena i czas realizacji", this.line.h2);
    this.wrapped(source, f.small, c.MUTED, MARGIN, W - 2 * MARGIN, this.line.small);
    this.y += 8;

    rows.forEach((r) => {
      if (r.divider) { this.rule(this.y - 2); this.y += 8; }
      r.labelLines.forEach((line, i) => this.text(line, f.body, c.MUTED,
        MARGIN, this.y + i * this.line.body));
      r.valueLines.forEach((line, i) => this.text(line, r.valueFont,
        r.strong ? c.CELL : c.INK, r.valueX, this.y + i * r.valueLine));
      this.y += r.height - (r.divider ? 8 : 0);
    });
    this.y += 6;
    this.wrapped(noteText, f.small, c.MUTED, MARGIN, W - 2 * MARGIN, this.line.small);
    this.y += CARD_GAP + 4;
  };

  Doc.prototype.optimizerSection = function (o) {
    if (!o || !o.list || !o.list.length) return;
    const f = this.f, c = this.c;
    const rec = o.recommended;
    const noteLines = this.countLines(o.note, f.small, W - 2 * MARGIN);
    // Wiersze mają wyraźny odstęp; rekomendacja jest wyróżniona w tabeli,
    // więc nie powtarzamy jej w osobnym wierszu (zabrakłoby miejsca na A4).
    const tableGap = 8;
    const rowPad = Math.max(11, Math.round(this.line.small * 0.55));

    // Pełne nazwy modułów mieszczą się w pierwszej kolumnie w jednym wierszu.
    // Dzięki temu ranking zostaje na pierwszej stronie A4 we wszystkich motywach.
    const widths = [550, 105, 95, 140, 170];
    const cols = [MARGIN];
    widths.slice(0, -1).forEach(function (w) { cols.push(cols[cols.length - 1] + w); });
    const areaHead = o.mode === "both" ? "Pow. modułów [m²]"
      : o.mode === "power" ? "Wymagana pow. [m²]" : "Zajęta pow. [m²]";
    const heads = ["Moduł", "Panele [szt.]", "Moc [kW]", areaHead, "Razem [zł]"];
    const headLines = heads.map((h, i) => this.splitLines(h, f.small, widths[i]));
    const headHeight = Math.max.apply(null, headLines.map(function (lines) {
      return lines.length;
    })) * this.line.small + 6;

    const rowData = o.list.map((x) => {
      const areaText = o.mode === "power" && !x.fitsArea
        ? "za dużo" : M.fmtArea(x.neededM2) + " m²";
      const values = [
        x.rank + ". " + x.name + " · " + M.fmt(x.wp) + " Wp",
        x.panels + " szt.",
        M.fmt(x.installedKw) + " kW",
        areaText,
        M.money(x.totalZl),
      ];
      const lines = values.map((value, i) => this.splitLines(value, f.small, widths[i]));
      return {
        x: x, lines: lines,
        height: Math.max.apply(null, lines.map(function (cell) { return cell.length; })) *
          this.line.small + rowPad,
      };
    });
    const rowsHeight = rowData.reduce(function (sum, r) { return sum + r.height; }, 0);
    const height = 10 + this.line.h2 + noteLines * this.line.small +
      tableGap + headHeight + 6 + rowsHeight + CARD_GAP + 4;
    this.ensure(height + 20);
    this.cardRect(this.y, height - CARD_GAP);
    this.y += 10;
    this.sectionTitle("Najtańszy wariant — dobór modułu i mocy", this.line.h2);
    this.wrapped(o.note, f.small, c.MUTED, MARGIN, W - 2 * MARGIN, this.line.small);
    this.y += tableGap;

    this.box(MARGIN, this.y - 4, W - 2 * MARGIN, headHeight,
             c.TABLE_HEAD_BG, null, Math.min(8, this.shape.radius));
    headLines.forEach((lines, i) => {
      lines.forEach((line, j) => {
        this.text(line, f.small, c.CELL, cols[i], this.y + j * this.line.small);
      });
    });
    this.y += headHeight;
    this.rule(this.y);
    this.y += 6;

    rowData.forEach((row) => {
      const best = rec && row.x.id === rec.id;
      row.lines.forEach((lines, i) => {
        lines.forEach((line, j) => {
          this.text(line, f.small, best && (i === 0 || i === 4) ? c.CELL : c.INK,
                    cols[i], this.y + j * this.line.small);
        });
      });
      this.y += row.height;
    });
    this.y += CARD_GAP + 4;
  };

  Doc.prototype.render = function (r, e, o) {
    const f = this.f, c = this.c;
    if (!o) o = M.optimize("both", r.ha, r.kw, undefined, r.place_text);
    if (!e) e = M.estimateFromOptimizer(r.ha, r.kw, undefined, o, r.place_text);

    this.setFooter([M.SOURCE_LINE, M.DISCLAIMER, M.AUTHOR_LINE]);
    this.header("Formalność OZE — raport",
                `Wynik analizy · wersja ${M.VERSION} · ${M.todayPl()}`);
    this.y = CONTENT_TOP;

    const params =
      e.presetName + " · " + M.fmt(e.options.panelWp) + " Wp · " +
      M.fmt(e.options.panelAreaM2) + " m² · pokrycie " +
      M.fmt(e.options.coveragePct) + "% · moduł " +
      M.money(e.options.modulePriceZl) + "/szt. · BOS " +
      M.money(e.options.bosPerPanelZl) + "/panel · robocizna " +
      M.money(e.options.laborPerPanelZl) + "/panel · " +
      e.options.panelsPerDay + " paneli/dzień";
    const paramLines = this.countLines(params, f.small, W - 2 * MARGIN);
    const inputUsed = this.line.h2 + 4 * this.row + 16 + 20 +
                      paramLines * this.line.small + 12;
    this.ensure(inputUsed + 20);
    this.cardRect(this.y, inputUsed - CARD_GAP);
    this.sectionTitle("Dane wejściowe", this.line.h2);

    const pair = (label, value) => {
      this.text(label, f.body, c.MUTED, MARGIN, this.y);
      this.text(value, f.body, c.INK, MARGIN + 250, this.y);
      this.y += this.row;
    };
    pair("Miejsce montażu", r.place_text);
    pair("Lokalizacja", r.location_text);
    pair("Powierzchnia", M.fmt(r.ha) + " ha");
    pair("Moc", M.fmt(r.kw) + " kW");
    this.y += 16;
    this.text("Parametry stałe (nieedytowalne w formularzu)", f.small, c.MUTED,
              MARGIN, this.y);
    this.y += 20;
    this.wrapped(params, f.small, c.INK, MARGIN, W - 2 * MARGIN, this.line.small);
    this.y += 12;

    const boxW = (W - 2 * MARGIN - 24) / 2;
    const envLines = this.countLines(r.env_desc, f.small, boxW - 40);
    const permLines = this.countLines(r.perm_desc, f.small, boxW - 40);
    const verdictHeight = 96 + Math.max(envLines, permLines) * this.line.small;
    this.ensure(verdictHeight + 20);
    const envHeight = this.verdictBox(MARGIN, this.y, boxW, r.env,
                                      "Decyzja środowiskowa", r.env_desc);
    const permHeight = this.verdictBox(MARGIN + boxW + 24, this.y, boxW, r.perm,
                                       "Pozwolenie na budowę", r.perm_desc);
    this.y += Math.max(envHeight, permHeight) + CARD_GAP;

    this.ensure(this.line.h2 + this.line.sub + 20);
    this.sectionTitle(`Ścieżka ${r.path_no}: ${r.path_name}`, this.line.h2);
    this.wrapped(r.path_meta, f.sub, c.MUTED, MARGIN, W - 2 * MARGIN, this.line.sub);
    this.y += 10;

    if (r.warning) {
      const lines = this.countLines(r.warning, f.small, W - 2 * MARGIN - 40);
      const boxHeight = Math.max(58, 24 + lines * this.line.small);
      this.ensure(boxHeight + 20);
      const saved = this.y;
      this.box(MARGIN, saved, W - 2 * MARGIN, boxHeight,
               c.id === "simple" ? null : c.WARN_BG, c.WARN_LINE, this.shape.radius);
      this.y = saved + 12;
      this.wrapped(r.warning, f.small, c.INK, MARGIN + 20,
                   W - 2 * MARGIN - 40, this.line.small);
      this.y = saved + boxHeight + CARD_GAP;
    }

    this.ensure(this.line.h2 + 20);
    this.sectionTitle("Kroki w kolejności", this.line.h2);

    r.steps.forEach((step, i) => {
      const lines = this.countLines(step.desc, f.small, W - 2 * MARGIN - 70);
      // Karta kończy się przed faktycznym przesunięciem y, dzięki czemu
      // kolejny prostokąt nie dotyka poprzedniego.
      const stepUsed = this.line.h3 + 6 + lines * this.line.small + 16;
      this.ensure(stepUsed + 20);
      this.cardRect(this.y, stepUsed - CARD_GAP);
      const cx = MARGIN + 15, cy = this.y + 15, sh = this.shape;
      const num = String(i + 1);
      this.ctx.font = f.num;
      if (sh.badge === "square") {
        if (sh.cardFill) {
          this.ctx.fillStyle = c.ACCENT;
          this.ctx.fillRect(cx - 15, cy - 15, 30, 30);
        } else {
          this.ctx.strokeStyle = c.ACCENT;
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(cx - 15, cy - 15, 30, 30);
        }
      } else if (sh.badge === "rounded") {
        this.ctx.fillStyle = c.GOLD || c.CARD_ACCENT;
        roundedRectPath(this.ctx, cx - 15, cy - 15, 30, 30, 8);
        this.ctx.fill();
      } else {
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 15, 0, 2 * Math.PI);
        this.ctx.fillStyle = c.ACCENT;
        this.ctx.fill();
      }
      const nw = this.ctx.measureText(num).width;
      const ink = sh.badge === "square" && !sh.cardFill ? c.ACCENT : c.ON_PRIMARY;
      this.text(num, f.num, ink, MARGIN + (30 - nw) / 2, this.y + 2);
      this.text(step.name, f.h3, c.INK, MARGIN + 44, this.y);
      this.y += this.line.h3 + 6;
      this.wrapped(step.desc, f.small, c.BODY_INK,
                   MARGIN + 44, W - 2 * MARGIN - 70, this.line.small);
      this.y += 16;
    });

    this.estimateSection(e);
    this.optimizerSection(o);

    this.finish([M.SOURCE_LINE, M.DISCLAIMER, M.AUTHOR_LINE]);
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
      bytes: dataUrlBytes(page.canvas.toDataURL("image/jpeg", JPEG_QUALITY)),
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
    themeShape: shape,
    themeFont: themeFont,
    themeLineHeights: lineHeightsFor,
    themeRowHeight: rowHeightFor,
    lineHeight: lineHeight,
    lineHeights: LINE,
    createDoc: function (theme) { return new Doc(theme); },
    roundedRectPath: roundedRectPath,
    drawWatermark: drawWatermark,
    watermark: WATERMARK,
    watermarkLines: WATERMARK_LINES,
    defaultTheme: "premium",
    constants: { W: W, H: H, MARGIN: MARGIN, S: S, PXW: PXW, PXH: PXH,
                 PAGE_W: PAGE_W, PAGE_H: PAGE_H, CARD_GAP: CARD_GAP,
                 JPEG_QUALITY: JPEG_QUALITY },
  };
})(typeof window !== "undefined" ? window : globalThis);
