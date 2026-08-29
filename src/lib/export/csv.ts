// CSV that Excel opens correctly, which is the only test that matters here.

export type Cell = string | number | null | undefined;

/// Quotes a field only when it has to be, and doubles any quote inside it.
function escape(value: Cell): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  // CRLF: Excel is the destination, and it is the safer line ending there.
  return lines.join("\r\n");
}

/// A UTF-8 byte order mark. Without it Excel reads the file as the system
/// codepage and Devanagari names come out as mojibake — the whole point of
/// exporting a Nepali school's roll is lost.
const BOM = String.fromCharCode(0xfeff); // U+FEFF, written explicitly

export function csvResponse(filename: string, csv: string) {
  // Strip anything that would let a filename break out of the header.
  const safe = filename.replace(/[^\w.\- ]+/g, "_");
  return new Response(BOM + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "no-store",
    },
  });
}

/// Formulas are not data. A field starting with =, +, - or @ is executed by
/// Excel on open, so it is prefixed to keep it inert.
export function safeText(value: Cell): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
