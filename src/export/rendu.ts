import { marked, Token, Tokens } from 'marked';
import { AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import PDFDocument from 'pdfkit';

/** En-tête commun d'un livrable exporté. */
export interface Entete { projet: string; client: string; code: string; titre: string; version: string; statut: string; date: string; auteur?: string }

type Seg = { t: string; b?: boolean; i?: boolean; c?: boolean };
/** Aplatit les éléments en ligne (gras, italique, code) en segments de texte. */
function segments(tokens: Token[] | undefined, st: Omit<Seg, 't'> = {}): Seg[] {
  const out: Seg[] = [];
  for (const k of tokens ?? []) {
    const x = k as any;
    switch (k.type) {
      case 'strong': out.push(...segments(x.tokens, { ...st, b: true })); break;
      case 'em': out.push(...segments(x.tokens, { ...st, i: true })); break;
      case 'codespan': out.push({ t: decoder(x.text), ...st, c: true }); break;
      case 'br': out.push({ t: '\n', ...st }); break;
      case 'link': out.push(...segments(x.tokens, st)); break;
      case 'del': out.push(...segments(x.tokens, st)); break;
      case 'text': out.push(...(x.tokens ? segments(x.tokens, st) : [{ t: decoder(x.text), ...st }])); break;
      default: out.push({ t: decoder(x.text ?? x.raw ?? ''), ...st });
    }
  }
  return out;
}
const decoder = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// =================================================================== DOCX
const runs = (s: Seg[], base: { size?: number; color?: string } = {}) =>
  s.map((x) => new TextRun({ text: x.t, bold: x.b, italics: x.i, font: x.c ? 'Consolas' : undefined, size: base.size, color: base.color }));
const NIVEAUX = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

function blocsDocx(tokens: Token[], niveauListe = 0): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const k of tokens) {
    const x = k as any;
    switch (k.type) {
      case 'heading': out.push(new Paragraph({ heading: NIVEAUX[x.depth - 1], children: runs(segments(x.tokens)) })); break;
      case 'paragraph': out.push(new Paragraph({ children: runs(segments(x.tokens)), spacing: { after: 120 } })); break;
      case 'list':
        (x as Tokens.List).items.forEach((it, i) => {
          const [premier, ...reste] = it.tokens;
          const txt = premier && (premier.type === 'text' || premier.type === 'paragraph') ? segments((premier as any).tokens ?? [premier]) : [];
          const puce = it.task ? (it.checked ? '☑ ' : '☐ ') : x.ordered ? `${(Number(x.start) || 1) + i}. ` : '• ';
          out.push(new Paragraph({ indent: { left: 360 * (niveauListe + 1), hanging: 260 }, children: [new TextRun(puce), ...runs(txt)], spacing: { after: 60 } }));
          out.push(...blocsDocx(premier && (premier.type === 'text' || premier.type === 'paragraph') ? reste : it.tokens, niveauListe + 1));
        });
        break;
      case 'code': for (const l of String(x.text).split('\n'))
        out.push(new Paragraph({ shading: { type: ShadingType.CLEAR, fill: 'F2F4F5', color: 'auto' }, children: [new TextRun({ text: l || ' ', font: 'Consolas', size: 18 })] })); break;
      case 'blockquote': for (const b of blocsDocx(x.tokens, niveauListe)) out.push(b instanceof Paragraph ? new Paragraph({ indent: { left: 400 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: '7A9A9A', space: 8 } }, children: runs(segments((x.tokens[0] as any)?.tokens ?? [])) }) : b); break;
      case 'hr': out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } }, children: [] })); break;
      case 'table': {
        const t = x as Tokens.Table;
        const cell = (c: Tokens.TableCell, entete: boolean) => new TableCell({ shading: entete ? { type: ShadingType.CLEAR, fill: 'E6EEEE', color: 'auto' } : undefined,
          children: [new Paragraph({ children: runs(segments(c.tokens).map((s) => ({ ...s, b: s.b || entete }))) })] });
        out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: t.header.map((c) => cell(c, true)) }), ...t.rows.map((r) => new TableRow({ children: r.map((c) => cell(c, false)) }))] }));
        out.push(new Paragraph({ children: [] }));
        break;
      }
      case 'space': break;
      default: if (x.text) out.push(new Paragraph({ children: [new TextRun(decoder(x.text))] }));
    }
  }
  return out;
}

export async function versDocx(e: Entete, md: string): Promise<Buffer> {
  const doc = new Document({
    creator: 'Pilotage', title: `${e.code} — ${e.titre}`, description: `${e.projet} · version ${e.version}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${e.projet} — ${e.code} v${e.version}`, size: 16, color: '777777' })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 16, color: '777777' })] })] }) },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(e.titre)] }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
          ['Projet', `${e.projet}${e.client ? ' — ' + e.client : ''}`], ['Document', e.code], ['Version', e.version], ['Statut', e.statut], ['Date', e.date], ...(e.auteur ? [['Auteur', e.auteur]] : []),
        ].map(([k, v]) => new TableRow({ children: [new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, fill: 'E6EEEE', color: 'auto' }, children: [new Paragraph({ children: [new TextRun({ text: k, bold: true })] })] }),
          new TableCell({ children: [new Paragraph(v)] })] })) }),
        new Paragraph({ children: [] }),
        ...blocsDocx(marked.lexer(md)),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

// =================================================================== PDF
const POLICE = (s: Seg) => (s.c ? 'Courier' : s.b && s.i ? 'Helvetica-BoldOblique' : s.b ? 'Helvetica-Bold' : s.i ? 'Helvetica-Oblique' : 'Helvetica');
/** Les polices standard PDF (WinAnsi) ne couvrent pas tout l'Unicode : on remplace les caractères hors jeu. */
const EQUIV: Record<string, string> = { '‘': "'", '’': "'", '“': '"', '”': '"', '☑': '[x]', '☐': '[ ]', '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '▶': '>', '◀': '<', '▲': '^', '▼': 'v',
  '─': '-', '━': '-', '═': '=', '│': '|', '┃': '|', '║': '|', '┌': '+', '┐': '+', '└': '+', '┘': '+', '├': '+', '┤': '+', '┬': '+', '┴': '+', '┼': '+', '╔': '+', '╗': '+', '╚': '+', '╝': '+',
  '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x', '≤': '<=', '≥': '>=', '≠': '!=', '×': 'x', '·': '·', '\u00a0': ' ', '\u202f': ' ' };
const winAnsi = (s: string) => s.replace(/[^\x00-\xFF€…–—•œŒ]/g, (c) => EQUIV[c] ?? (/\p{Extended_Pictographic}/u.test(c) ? '' : '?'));

function ecrire(pdf: PDFKit.PDFDocument, s: Seg[], opts: { size?: number; indent?: number; width?: number } = {}) {
  const size = opts.size ?? 10.5;
  const x = pdf.page.margins.left + (opts.indent ?? 0);
  const width = opts.width ?? pdf.page.width - pdf.page.margins.right - x;
  if (!s.length) s = [{ t: ' ' }];
  // Même corps pour tous les segments d'une ligne : changer de taille en cours de ligne force un retour à la ligne dans pdfkit.
  s.forEach((g, i) => {
    pdf.font(POLICE(g)).fontSize(size);
    if (i === 0) pdf.text(winAnsi(g.t), x, undefined, { continued: s.length > 1, width, lineGap: 2 });
    else pdf.text(winAnsi(g.t), { continued: i < s.length - 1 });
  });
}

function blocsPdf(pdf: PDFKit.PDFDocument, tokens: Token[], indent = 0) {
  for (const k of tokens) {
    const x = k as any;
    switch (k.type) {
      case 'heading': pdf.moveDown(0.6); pdf.fillColor('#0b5c57'); ecrire(pdf, segments(x.tokens).map((s) => ({ ...s, b: true })), { size: [20, 15, 12.5, 11.5, 11, 11][x.depth - 1], indent }); pdf.fillColor('black'); pdf.moveDown(0.3); break;
      case 'paragraph': ecrire(pdf, segments(x.tokens), { indent }); pdf.moveDown(0.5); break;
      case 'list':
        (x as Tokens.List).items.forEach((it, i) => {
          const [premier, ...reste] = it.tokens;
          const inline = premier && (premier.type === 'text' || premier.type === 'paragraph');
          const puce = it.task ? (it.checked ? '[x] ' : '[ ] ') : x.ordered ? `${(Number(x.start) || 1) + i}. ` : '• ';
          ecrire(pdf, [{ t: puce }, ...(inline ? segments((premier as any).tokens ?? [premier]) : [])], { indent: indent + 12 });
          blocsPdf(pdf, inline ? reste : it.tokens, indent + 18);
        });
        pdf.moveDown(0.4); break;
      case 'code': {
        const y = pdf.y; const lignes = String(x.text).split('\n');
        const h = lignes.length * 11 + 8;
        if (y + h < pdf.page.height - pdf.page.margins.bottom) pdf.rect(pdf.page.margins.left + indent, y - 2, pdf.page.width - pdf.page.margins.left - pdf.page.margins.right - indent, h).fill('#f2f4f5').fillColor('black');
        pdf.y = y + 2; for (const l of lignes) ecrire(pdf, [{ t: l || ' ', c: true }], { size: 9.5, indent: indent + 6 }); pdf.moveDown(0.6); break;
      }
      case 'blockquote': pdf.fillColor('#555555'); blocsPdf(pdf, x.tokens, indent + 14); pdf.fillColor('black'); break;
      case 'hr': pdf.moveDown(0.3); pdf.moveTo(pdf.page.margins.left, pdf.y).lineTo(pdf.page.width - pdf.page.margins.right, pdf.y).strokeColor('#bbbbbb').stroke(); pdf.moveDown(0.6); break;
      case 'table': {
        const t = x as Tokens.Table;
        const larg = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right - indent;
        const n = t.header.length; const w = larg / n;
        const ligne = (cells: Tokens.TableCell[], entete: boolean) => {
          const textes = cells.map((c) => winAnsi(segments(c.tokens).map((s) => s.t).join('')));
          pdf.font(entete ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5);
          const h = Math.max(...textes.map((s) => pdf.heightOfString(s, { width: w - 8 }))) + 8;
          if (pdf.y + h > pdf.page.height - pdf.page.margins.bottom) pdf.addPage();
          const y = pdf.y;
          if (entete) pdf.rect(pdf.page.margins.left + indent, y, larg, h).fill('#e6eeee').fillColor('black');
          textes.forEach((s, i) => pdf.font(entete ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).text(s, pdf.page.margins.left + indent + i * w + 4, y + 4, { width: w - 8 }));
          pdf.moveTo(pdf.page.margins.left + indent, y + h).lineTo(pdf.page.margins.left + indent + larg, y + h).strokeColor('#cccccc').stroke();
          pdf.y = y + h; pdf.x = pdf.page.margins.left;
        };
        ligne(t.header, true); for (const r of t.rows) ligne(r, false); pdf.moveDown(0.6); break;
      }
      case 'space': break;
      default: if (x.text) { ecrire(pdf, [{ t: decoder(x.text) }], { indent }); pdf.moveDown(0.4); }
    }
  }
}

export function versPdf(e: Entete, md: string): Promise<Buffer> {
  return new Promise((ok, ko) => {
    const pdf = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: 56, right: 56 }, bufferPages: true, info: { Title: `${e.code} — ${e.titre}`, Author: e.auteur ?? 'Pilotage', Creator: 'Pilotage' } });
    const parts: Buffer[] = []; pdf.on('data', (b) => parts.push(b)); pdf.on('end', () => ok(Buffer.concat(parts))); pdf.on('error', ko);
    pdf.font('Helvetica-Bold').fontSize(22).fillColor('#0b5c57').text(winAnsi(e.titre)); pdf.fillColor('black').moveDown(0.5);
    for (const [k, v] of [['Projet', `${e.projet}${e.client ? ' — ' + e.client : ''}`], ['Document', e.code], ['Version', e.version], ['Statut', e.statut], ['Date', e.date], ...(e.auteur ? [['Auteur', e.auteur]] : [])])
      pdf.font('Helvetica-Bold').fontSize(10).text(`${k} : `, { continued: true }).font('Helvetica').text(winAnsi(v));
    pdf.moveDown(0.5); pdf.moveTo(pdf.page.margins.left, pdf.y).lineTo(pdf.page.width - pdf.page.margins.right, pdf.y).strokeColor('#0b5c57').stroke(); pdf.moveDown(0.8);
    blocsPdf(pdf, marked.lexer(md));
    const n = pdf.bufferedPageRange().count;
    for (let i = 0; i < n; i++) {
      pdf.switchToPage(i);
      const bas = pdf.page.margins.bottom; pdf.page.margins.bottom = 0;
      pdf.font('Helvetica').fontSize(8).fillColor('#777777')
        .text(winAnsi(`${e.projet} — ${e.code} v${e.version}`), 56, 30, { width: pdf.page.width - 112, align: 'right', lineBreak: false })
        .text(`Page ${i + 1} / ${n}`, 56, pdf.page.height - 40, { width: pdf.page.width - 112, align: 'center', lineBreak: false });
      pdf.page.margins.bottom = bas;
    }
    pdf.end();
  });
}
