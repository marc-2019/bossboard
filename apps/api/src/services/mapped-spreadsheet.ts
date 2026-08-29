/**
 * Generic mapped spreadsheet import.
 * Operator maps Date, Amount, Description. Not bank-brand detect.
 */

import { inflateRawSync } from 'zlib';

export type ColumnMap = {
  date: string;
  amount: string;
  description: string;
};

export type SpreadsheetTable = {
  headers: string[];
  rows: string[][];
};

export type MappedRow = {
  date: string;
  amount: number;
  description: string | null;
};

export function parseCsvLine(line: string, delimiter = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function normalizeDate(dateStr: string): string | null {
  const trimmed = dateStr.trim().replace(/"/g, '');
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.substring(0, 10);
  }
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().substring(0, 10);
  }
  return null;
}

function parseDelimitedText(text: string): SpreadsheetTable {
  const raw = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const first = lines[0];
  const delimiter = first.includes('\t') && first.split('\t').length > first.split(',').length ? '\t' : ',';
  const headers = parseCsvLine(first, delimiter).map((h) => h.replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => parseCsvLine(line, delimiter));
  return { headers, rows };
}

function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let i = 0;
  while (i + 30 <= buf.length) {
    if (buf.readUInt32LE(i) !== 0x04034b50) break;
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const uncompSize = buf.readUInt32LE(i + 22);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString('utf8');
    const dataStart = i + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    let raw: Buffer;
    if (method === 0) raw = Buffer.from(data);
    else if (method === 8) raw = inflateRawSync(data);
    else {
      i = dataStart + compSize;
      continue;
    }
    if (uncompSize && raw.length > uncompSize) raw = raw.subarray(0, uncompSize);
    out.set(name, raw);
    i = dataStart + compSize;
  }
  return out;
}

function xmlDecode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function colToIndex(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/i) || ['A'])[0].toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseXlsxBuffer(buf: Buffer): SpreadsheetTable {
  const entries = readZipEntries(buf);
  const sheetKey = [...entries.keys()].find((k) => /xl\/worksheets\/sheet1\.xml$/i.test(k));
  if (!sheetKey) throw new Error('Could not read this spreadsheet. Save as CSV or xlsx.');
  const sheet = entries.get(sheetKey)!.toString('utf8');
  const sstKey = [...entries.keys()].find((k) => /xl\/sharedStrings\.xml$/i.test(k));
  const shared: string[] = [];
  if (sstKey) {
    const sst = entries.get(sstKey)!.toString('utf8');
    const siBlocks = sst.match(/<si[\s\S]*?<\/si>/g) || [];
    for (const si of siBlocks) {
      const texts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlDecode(m[1]));
      shared.push(texts.join(''));
    }
  }
  const rowsXml = sheet.match(/<row\b[\s\S]*?<\/row>/g) || [];
  const grid: string[][] = [];
  for (const rowXml of rowsXml) {
    const cells = rowXml.match(/<c\b[\s\S]*?<\/c>|<c\b[^>]*\/>/g) || [];
    const row: string[] = [];
    for (const cell of cells) {
      const ref = (cell.match(/r="([A-Z]+\d+)"/i) || [])[1];
      const idx = ref ? colToIndex(ref) : row.length;
      const t = (cell.match(/t="([^"]+)"/) || [])[1];
      let value = '';
      if (t === 's') {
        const v = (cell.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        value = shared[parseInt(v || '0', 10)] || '';
      } else if (t === 'inlineStr') {
        const texts = [...cell.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlDecode(m[1]));
        value = texts.join('');
      } else {
        const v = (cell.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        value = v ? xmlDecode(v) : '';
      }
      while (row.length < idx) row.push('');
      row[idx] = value;
    }
    grid.push(row);
  }
  if (grid.length === 0) return { headers: [], rows: [] };
  return { headers: grid[0].map((h) => String(h || '').trim()), rows: grid.slice(1) };
}

export function parseSpreadsheet(input: string | Buffer, filename: string): SpreadsheetTable {
  const name = (filename || '').toLowerCase();
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const isZip = buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;
  if (isZip || name.endsWith('.xlsx')) {
    return parseXlsxBuffer(buf);
  }
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
  if (name.endsWith('.xls') && text.includes('<ss:Workbook')) {
    throw new Error('Could not read this spreadsheet. Save as CSV or xlsx.');
  }
  return parseDelimitedText(text);
}

export function applyColumnMap(table: SpreadsheetTable, map: ColumnMap): MappedRow[] {
  const headers = table.headers;
  const dateIdx = headers.findIndex((h) => h === map.date);
  const amountIdx = headers.findIndex((h) => h === map.amount);
  const descIdx = headers.findIndex((h) => h === map.description);
  if (dateIdx < 0 || amountIdx < 0 || descIdx < 0) {
    throw new Error('Map Date, Amount, and Description to columns that exist in the file.');
  }
  const out: MappedRow[] = [];
  for (const cols of table.rows) {
    const date = normalizeDate(cols[dateIdx] || '');
    if (!date) continue;
    const amountStr = (cols[amountIdx] || '0').replace(/[,$]/g, '').replace(/\s/g, '');
    const amountFloat = parseFloat(amountStr);
    if (Number.isNaN(amountFloat)) continue;
    const description = (cols[descIdx] || '').trim() || null;
    out.push({
      date,
      amount: Math.round(amountFloat * 100),
      description,
    });
  }
  return out;
}

export function parseMappedSpreadsheet(
  input: string | Buffer,
  filename: string,
  map: ColumnMap
): MappedRow[] {
  return applyColumnMap(parseSpreadsheet(input, filename), map);
}
