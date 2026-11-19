/* ==========================================================================
   PV Formalność — wersja web
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

  const INK = "#13263A", MUTED = "#5A6B7B", CELL = "#0F2742";
  const BODY_INK = "#33485B", NEED = "#B4531A", FREE = "#0F7A4B";
  const HEADER_SUB = "#B9CFDC";
  const ACCENT = "#2E7FB8", FREE_BG = "#E7F5EE", NEED_BG = "#FCEEE4";
  const WARN_BG = "#FFF6DA", WARN_LINE = "#D9B45A", PRIMARY = "#0F2742";

  function fontPx(pt) { return Math.max(8, Math.round(pt * 150 / 72)); }
  function fontDef(pt, bold) {
    return `${fontPx(pt)}px "${bold ? "DejaVu-Bold" : "DejaVu"}", sans-serif`;
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

  function Doc() {
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

  Doc.prototype.verdictBox = function (x, y, w, need, title, desc) {
    this.ctx.fillStyle = need ? NEED_BG : FREE_BG;
    this.ctx.fillRect(x, y, w, 140);
    this.ctx.fillStyle = need ? NEED : FREE;
    this.ctx.fillRect(x, y, 8, 140);
    this.text(title, this.f.h3, INK, x + 22, y + 12);
    this.text(need ? "TAK" : "NIE", this.f.big, need ? NEED : FREE, x + 22, y + 38);
    const saved = this.y;
    this.y = y + 88;
    this.wrapped(desc, this.f.small, MUTED, x + 22, w - 40, 17);
    this.y = saved;
  };

  Doc.prototype.estimateSection = function (e) {
    const f = this.f;
    this.ensure(60);
    this.y += 10;
    this.text("Wycena i czas realizacji", f.h2, CELL, MARGIN, this.y);
    this.y += 28;
    this.wrapped(e.presetName + " · " + M.COST_SOURCE_LINE,
                 f.small, MUTED, MARGIN, W - 2 * MARGIN, 16);
    this.y += 8;

    const row = (label, value, strong) => {
      this.ensure(24);
      this.text(label, f.body, MUTED, MARGIN, this.y);
      this.text(value, strong ? f.h3 : f.body, strong ? CELL : INK, MARGIN + 330, this.y);
      this.y += 24;
    };
    row("Liczba paneli", e.panels + " szt.");
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
    this.wrapped(e.powerNote, f.small, MUTED, MARGIN, W - 2 * MARGIN, 16);
    this.y += 8;
  };

  Doc.prototype.optimizerSection = function (o) {
    if (!o || !o.list || !o.list.length) return;
    const f = this.f;
    const ctx = this.ctx;
    const fit = (value, maxWidth) => {
      let s = String(value);
      if (ctx.measureText(s).width <= maxWidth) return s;
      while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) {
        s = s.slice(0, -1);
      }
      return s + "…";
    };

    this.ensure(60);
    this.y += 10;
    this.text("Najtańszy wariant — dobór modułu i mocy", f.h2, CELL, MARGIN, this.y);
    this.y += 28;
    this.wrapped(o.note, f.small, MUTED, MARGIN, W - 2 * MARGIN, 16);
    const rec = o.recommended;
    if (rec) {
      this.y += 8;
      this.ensure(30);
      this.text("Rekomendacja: " + rec.name + " · " + rec.panels + " szt. · " +
                M.fmt(rec.installedKw) + " kW · " + M.money(rec.totalZl),
                f.body, CELL, MARGIN, this.y);
      this.y += 32;
    }

    const cols = [MARGIN, MARGIN + 430, MARGIN + 520, MARGIN + 630, MARGIN + 840];
    const areaHead = o.mode === "power" ? "Pow. wymagana" : "Pow. zajęta";
    const heads = ["Moduł", "Panele", "Moc", areaHead, "Razem"];
    this.ensure(30);
    ctx.fillStyle = "#EDF2F7";
    ctx.fillRect(MARGIN, this.y - 4, W - 2 * MARGIN, 24);
    ctx.font = f.small;
    heads.forEach((h, i) => this.text(fit(h, i === 0 ? 415 : 100), f.small,
                                      CELL, cols[i], this.y));
    this.y += 28;

    o.list.forEach(function (x) {
      this.ensure(24);
      const best = rec && x.id === rec.id;
      const areaText = o.mode === "power"
        ? (x.fitsArea ? M.fmt(x.neededHa) + " ha" : "za dużo")
        : M.fmt(x.neededM2) + " m²";
      ctx.font = f.small;
      this.text(fit(x.rank + ". " + x.name + " " + M.fmt(x.wp) + " Wp", 415),
                f.small, best ? CELL : INK, cols[0], this.y);
      this.text(x.panels + " szt.", f.small, INK, cols[1], this.y);
      this.text(M.fmt(x.installedKw) + " kW", f.small, INK, cols[2], this.y);
      this.text(fit(areaText, 100), f.small, INK, cols[3], this.y);
      this.text(fit(M.money(x.totalZl), 145), f.small, best ? CELL : INK,
                cols[4], this.y);
      this.y += 24;
    }, this);
    this.y += 8;
  };

  Doc.prototype.render = function (r, e, o) {
    const f = this.f;
    if (!e) e = M.estimate(r.ha, r.kw);
    if (!o) o = M.optimize("power", r.ha, r.kw);
    this.ctx.fillStyle = PRIMARY;
    this.ctx.fillRect(0, 0, W, 130);
    this.text("Formalności dla instalacji fotowoltaicznej", f.title, "#FFFFFF", MARGIN, 26);
    this.text(`Wynik analizy · wersja ${M.VERSION} · ${M.todayPl()}`,
              f.sub, HEADER_SUB, MARGIN, 80);

    this.y = 165;
    this.ensure(30);
    this.text("Dane wejściowe", f.h2, CELL, MARGIN, this.y);
    this.y += 34;

    const pair = (label, value) => {
      this.ensure(28);
      this.text(label, f.body, MUTED, MARGIN, this.y);
      this.text(value, f.body, INK, MARGIN + 250, this.y);
      this.y += 28;
    };
    pair("Miejsce montażu", r.place_text);
    pair("Lokalizacja", r.location_text);
    pair("Powierzchnia", M.fmt(r.ha) + " ha");
    pair("Moc", M.fmt(r.kw) + " kW");
    this.y += 16;

    this.ensure(140);
    const boxW = (W - 2 * MARGIN - 24) / 2;
    this.verdictBox(MARGIN, this.y, boxW, r.env, "Decyzja środowiskowa", r.env_desc);
    this.verdictBox(MARGIN + boxW + 24, this.y, boxW, r.perm,
                    "Pozwolenie na budowę", r.perm_desc);
    this.y += 140;

    this.ensure(60);
    this.text(`Ścieżka ${r.path_no}: ${r.path_name}`, f.h2, CELL, MARGIN, this.y);
    this.y += 30;
    this.wrapped(r.path_meta, f.sub, MUTED, MARGIN, W - 2 * MARGIN, 20);
    this.y += 10;

    if (r.warning) {
      const saved = this.y;
      this.y += 12;
      this.ctx.fillStyle = WARN_BG;
      this.ctx.fillRect(MARGIN, saved, W - 2 * MARGIN, 58);
      this.ctx.strokeStyle = WARN_LINE;
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(MARGIN, saved, W - 2 * MARGIN, 58);
      this.wrapped(r.warning, f.small, INK, MARGIN + 20, W - 2 * MARGIN - 40, 18);
      this.y = saved + 68;
    }

    this.ensure(36);
    this.text("Kroki w kolejności", f.h2, CELL, MARGIN, this.y);
    this.y += 36;

    r.steps.forEach((step, i) => {
      this.ctx.font = f.small;
      const lines = Math.max(1, Math.ceil(
        this.ctx.measureText(step.desc).width / (W - 2 * MARGIN - 70)));
      const descHeight = 60 + 18 * lines;
      this.ensure(descHeight + 20);
      this.ctx.fillStyle = ACCENT;
      this.ctx.beginPath();
      this.ctx.arc(MARGIN + 15, this.y + 15, 15, 0, 2 * Math.PI);
      this.ctx.fill();
      const num = String(i + 1);
      this.ctx.font = f.num;
      const nw = this.ctx.measureText(num).width;
      this.text(num, f.num, "#FFFFFF", MARGIN + (30 - nw) / 2, this.y + 2);
      this.text(step.name, f.h3, INK, MARGIN + 44, this.y);
      this.y += 34;
      this.wrapped(step.desc, f.small, BODY_INK, MARGIN + 44, W - 2 * MARGIN - 70, 18);
      this.y += 16;
    });

    this.estimateSection(e);
    this.optimizerSection(o);

    this.ensure(90);
    this.ctx.strokeStyle = "#CBD6DE";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(MARGIN, this.y);
    this.ctx.lineTo(W - MARGIN, this.y);
    this.ctx.stroke();
    this.y += 12;
    [M.SOURCE_LINE, M.DISCLAIMER, M.AUTHOR_LINE].forEach((line) => {
      this.wrapped(line, f.small, MUTED, MARGIN, W - 2 * MARGIN, 17);
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

  async function renderPdf(r, e, o) {
    await ensureFonts();
    const doc = new Doc();
    doc.render(r, e, o);
    const images = doc.pages.map((page) => ({
      bytes: dataUrlBytes(page.canvas.toDataURL("image/jpeg", 0.9)),
      w: PXW, h: PXH,
    }));
    return buildPdf(images);
  }

  /** Pierwsza strona tego samego układu, narysowana do widocznego canvasa. */
  async function renderPreview(r, target, e, o) {
    await ensureFonts();
    const doc = new Doc();
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
    constants: { W: W, H: H, S: S, PXW: PXW, PXH: PXH },
  };
})(typeof window !== "undefined" ? window : globalThis);
