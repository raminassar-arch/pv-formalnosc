/* ==========================================================================
   PV Formalność — wersja web
   xlsx.js — eksport XLSX. Port z pv_formalnosc/xlsx_export.py
   (czysty ZIP + XML, bez zależności zewnętrznych).
   ========================================================================== */
(function (root) {
  "use strict";

  const M = root.PVModel;
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function c(value, style) { return { value: value || "", style: style || 0, isNumber: false }; }
  function n(value) { return { value: M.fmt(value), style: 0, isNumber: true }; }

  function build(r) {
    const rows = [];
    const add = function () { rows.push(Array.prototype.slice.call(arguments)); };

    add(c("Formalności dla instalacji fotowoltaicznej – wynik", 1));
    add(c("Data"), c(M.todayPl()));
    add();
    add(c("Dane wejściowe", 2), c("", 2), c("", 2));
    add(c("Miejsce montażu"), c(r.place_text));
    add(c("Lokalizacja"), c(r.location_text));
    add(c("Powierzchnia (ha)"), n(r.ha));
    add(c("Moc (kW)"), n(r.kw));
    add();
    add(c("Wynik", 2), c("", 2), c("", 2));
    add(c("Decyzja środowiskowa", 1), c(r.env ? "TAK" : "NIE", 1), c(r.env_desc));
    add(c("Pozwolenie na budowę", 1), c(r.perm ? "TAK" : "NIE", 1), c(r.perm_desc));
    add(c("Ścieżka (gov.pl)", 1), c(`Ścieżka ${r.path_no}: ${r.path_name}`));
    add(c("Zakres"), c(r.path_meta));
    if (r.warning) add(c("Uwaga", 1), c(r.warning, 3));
    add();
    add(c("Nr", 2), c("Etap", 2), c("Opis", 2));
    r.steps.forEach((step, i) => add(n(i + 1), c(step.name, 3), c(step.desc, 3)));
    add();
    add(c(M.SOURCE_LINE));
    add(c(M.DISCLAIMER));
    add(c(M.AUTHOR_LINE.replace(" · ", ", ")));

    const cols = ["A", "B", "C"];
    const sheet = [];
    rows.forEach((row, ri) => {
      const cells = row.map((cell, ci) => {
        const ref = `${cols[ci]}${ri + 1}`;
        const style = cell.style ? ` s="${cell.style}"` : "";
        return cell.isNumber
          ? `<c r="${ref}"${style}><v>${cell.value}</v></c>`
          : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(cell.value)}</t></is></c>`;
      });
      sheet.push(`<row r="${ri + 1}">${cells.join("")}</row>`);
    });

    const styles =
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="3">' +
      '<font><sz val="10"/><name val="Arial"/></font>' +
      '<font><b/><sz val="10"/><name val="Arial"/></font>' +
      '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>' +
      '</fonts>' +
      '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF0F2742"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="4">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top"/></xf>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="top"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';

    const files = [
      { name: "[Content_Types].xml", data: X +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>' },
      { name: "_rels/.rels", data: X +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>' },
      { name: "xl/workbook.xml", data: X +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Wynik" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", data: X +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>' },
      { name: "xl/styles.xml", data: X + styles },
      { name: "xl/worksheets/sheet1.xml", data: X +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<cols><col min="1" max="1" width="26" customWidth="1"/>' +
        '<col min="2" max="2" width="52" customWidth="1"/>' +
        '<col min="3" max="3" width="95" customWidth="1"/></cols>' +
        '<sheetData>' + sheet.join("") + '</sheetData></worksheet>' },
    ];

    return root.PVZip.zip(files);
  }

  root.PVXlsx = { build: build, esc: esc };
})(typeof window !== "undefined" ? window : globalThis);
