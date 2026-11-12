import type { Command, Drawing } from './plateDesign';

/**
 * A minimal PDF 1.4 writer for vector drawings: filled and stroked paths only, no fonts or
 * images (letters are already outlines), so the file prints sharp at any size.
 */
const PT_PER_MM = 72 / 25.4;
const num = (value: number) => {
  const fixed = value.toFixed(3);
  return fixed.replace(/\.?0+$/, '') || '0';
};

function rgb(color: string) {
  const hex = color.replace('#', '');
  return [0, 2, 4].map((i) => num(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');
}

/** Page content stream: y is flipped (PDF origin is bottom-left) and mm become points. */
function contentStream(drawing: Drawing) {
  const out: string[] = [];
  const x = (mm: number) => num(mm * PT_PER_MM);
  const y = (mm: number) => num((drawing.height - mm) * PT_PER_MM);
  const path = (commands: Command[]) =>
    commands
      .map((c) => {
        if (c[0] === 'M') return `${x(c[1])} ${y(c[2])} m`;
        if (c[0] === 'L') return `${x(c[1])} ${y(c[2])} l`;
        if (c[0] === 'C')
          return `${x(c[1])} ${y(c[2])} ${x(c[3])} ${y(c[4])} ${x(c[5])} ${y(c[6])} c`;
        return 'h';
      })
      .join('\n');
  for (const shape of drawing.shapes) {
    if (shape.fill) {
      out.push(`${rgb(shape.fill)} rg`, path(shape.commands), shape.evenOdd ? 'f*' : 'f');
    }
    if (shape.stroke) {
      const { color, width, dash } = shape.stroke;
      out.push(
        `${rgb(color)} RG`,
        `${num(width * PT_PER_MM)} w`,
        dash ? `[${dash.map((d) => num(d * PT_PER_MM)).join(' ')}] 0 d` : '[] 0 d',
        path(shape.commands),
        'S',
      );
    }
  }
  return out.join('\n');
}

/** Builds a PDF with one page per drawing. Returns the file's bytes. */
export function buildPdf(pages: Drawing[], title = 'Tablice SCI'): Uint8Array {
  const objects: string[] = [];
  // 1: catalog, 2: page tree, 3: info, then a page and its content stream per drawing.
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  const safeTitle = title.replace(/[^\x20-\x7e]/g, '?').replace(/([()\\])/g, '\\$1');
  objects[3] = `<< /Title (${safeTitle}) /Producer (AI Vision Challenge) >>`;
  pages.forEach((page, i) => {
    const id = pageIds[i];
    const stream = contentStream(page);
    objects[id] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width * PT_PER_MM)} ${num(page.height * PT_PER_MM)}] ` +
      `/Contents ${id + 1} 0 R /Resources << >> >>`;
    objects[id + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let body = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++)
    body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Every character is one byte (Latin-1), so string offsets equal byte offsets.
  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
  return bytes;
}
