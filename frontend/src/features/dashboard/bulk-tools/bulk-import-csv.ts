import { isValid, parse } from "date-fns";

/*
 * "Map" step: read a CSV of captions/titles/times and match its rows to the
 * uploaded files, by file name when a column has one, otherwise by order.
 */

export type CsvTable = {
  headers: string[];
  rows: string[][];
};

export type CsvField = "file" | "caption" | "youtubeTitle" | "date" | "time";

/** Column index per field; -1 = not used. */
export type CsvMapping = Record<CsvField, number>;

export const CSV_FIELD_LABEL: Record<CsvField, string> = {
  file: "File name",
  caption: "Caption",
  youtubeTitle: "YouTube title",
  date: "Date (or date and time)",
  time: "Time",
};

export const CSV_MAX_BYTES = 2 * 1024 * 1024;

function detectDelimiter(firstLine: string): string {
  const counts: [string, number][] = [",", ";", "\t"].map((d) => [
    d,
    firstLine.split(d).length - 1,
  ]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** RFC 4180-style parser: quoted fields, "" escapes, CRLF, newlines in quotes. */
export function parseCsv(text: string): CsvTable {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = detectDelimiter(firstLine);
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === "") {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      out.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  const nonEmpty = out.filter((r) => r.some((cell) => cell.trim() !== ""));
  const [headers = [], ...rows] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows };
}

const GUESS: Record<CsvField, RegExp> = {
  file: /^(file|file ?name|filename|media|image|video|asset|name)$/i,
  caption: /^(caption|text|content|post|copy|body|description|message)$/i,
  youtubeTitle: /^(youtube ?title|yt ?title|title)$/i,
  date: /^(date|date ?time|datetime|when|schedule(d)?( ?at| ?for)?|publish( ?at| ?date)?|post ?date)$/i,
  time: /^(time|post ?time|publish ?time)$/i,
};

/** Best guess from header names; unused fields are -1. */
export function guessMapping(headers: string[]): CsvMapping {
  const used = new Set<number>();
  const pick = (field: CsvField) => {
    const i = headers.findIndex((h, idx) => !used.has(idx) && GUESS[field].test(h.trim()));
    if (i >= 0) used.add(i);
    return i;
  };
  // Order matters: "time" before "date" so a lone "time" column isn't taken
  // as the date; "title" before "file" so "name" stays available for files.
  const time = pick("time");
  const date = pick("date");
  const youtubeTitle = pick("youtubeTitle");
  const caption = pick("caption");
  const file = pick("file");
  const mapping: CsvMapping = { file, caption, youtubeTitle, date, time };
  // A single-column CSV is almost certainly captions.
  if (mapping.caption < 0 && headers.length === 1) mapping.caption = 0;
  return mapping;
}

const DATE_TIME_FORMATS = [
  "yyyy-MM-dd HH:mm",
  "yyyy-MM-dd H:mm",
  "yyyy-MM-dd'T'HH:mm",
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd HH:mm:ss",
  "yyyy-MM-dd h:mm a",
  "yyyy-MM-dd h:mma",
  "d MMM yyyy HH:mm",
  "d MMM yyyy h:mm a",
  "MMM d, yyyy HH:mm",
  "MMM d, yyyy h:mm a",
  "MMMM d, yyyy h:mm a",
];
const DATE_FORMATS = ["yyyy-MM-dd", "d MMM yyyy", "MMM d, yyyy", "MMMM d, yyyy"];
const TIME_FORMATS = ["HH:mm", "H:mm", "h:mm a", "h:mma", "ha", "h a", "HH:mm:ss"];

function tryFormats(value: string, formats: string[], ref: Date): Date | null {
  for (const f of formats) {
    const d = parse(value, f, ref);
    if (isValid(d)) return d;
  }
  return null;
}

/**
 * Local date-time from a date cell and an optional time cell. Accepts
 * ISO-like values ("2026-03-14 09:30") and spelled months ("14 Mar 2026
 * 9:30 am"). Numeric slash dates are rejected on purpose: 03/04 is ambiguous.
 * Returns null when the value can't be read.
 */
export function parseCsvDateTime(
  dateCell: string,
  timeCell: string | null,
  fallbackTime: { hours: number; minutes: number },
): Date | null {
  const ref = new Date(2000, 0, 1, 0, 0, 0, 0);
  const date = dateCell.trim();
  if (!date) return null;
  const time = timeCell?.trim() ?? "";
  if (time) {
    const day = tryFormats(date, DATE_FORMATS, ref);
    const t = tryFormats(time.toUpperCase().replace(/\s+/g, " "), TIME_FORMATS, ref);
    if (!day || !t) return null;
    day.setHours(t.getHours(), t.getMinutes(), 0, 0);
    return day;
  }
  const normalized = date.replace(/\s+/g, " ").replace(/(am|pm)$/i, (m) => m.toUpperCase());
  const full = tryFormats(normalized, DATE_TIME_FORMATS, ref);
  if (full) return full;
  const dayOnly = tryFormats(normalized, DATE_FORMATS, ref);
  if (dayOnly) {
    dayOnly.setHours(fallbackTime.hours, fallbackTime.minutes, 0, 0);
    return dayOnly;
  }
  // Values with an explicit offset ("2026-03-14T09:30:00Z").
  if (/\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(date)) {
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function stem(name: string): string {
  const base = name.trim().split(/[\\/]/).pop() ?? "";
  return base.toLowerCase();
}

function stemNoExt(name: string): string {
  return stem(name).replace(/\.[a-z0-9]{2,5}$/, "");
}

export type CsvApplyRow = {
  caption?: string;
  youtubeTitle?: string;
  scheduledAt?: Date;
};

export type CsvMatchResult = {
  /** fileId → values from its CSV row */
  byFileId: Map<string, CsvApplyRow>;
  matched: number;
  /** CSV rows with no file. */
  unmatchedRows: number;
  /** Date cells that couldn't be read. */
  badDates: number;
  byName: boolean;
};

/** Match CSV rows to files (by name if mapped, else by order). */
export function matchCsvToFiles(
  table: CsvTable,
  mapping: CsvMapping,
  files: { id: string; name: string }[],
  fallbackTime: { hours: number; minutes: number },
): CsvMatchResult {
  const byFileId = new Map<string, CsvApplyRow>();
  let badDates = 0;
  let unmatchedRows = 0;
  const byName = mapping.file >= 0;

  const exact = new Map<string, string>();
  const loose = new Map<string, string>();
  for (const f of files) {
    if (!exact.has(stem(f.name))) exact.set(stem(f.name), f.id);
    if (!loose.has(stemNoExt(f.name))) loose.set(stemNoExt(f.name), f.id);
  }

  table.rows.forEach((cells, index) => {
    const cell = (i: number) => (i >= 0 ? (cells[i] ?? "") : "");
    let fileId: string | undefined;
    if (byName) {
      const name = cell(mapping.file);
      fileId = exact.get(stem(name)) ?? loose.get(stemNoExt(name));
    } else {
      fileId = files[index]?.id;
    }
    if (!fileId || byFileId.has(fileId)) {
      unmatchedRows += 1;
      return;
    }
    const values: CsvApplyRow = {};
    if (mapping.caption >= 0) values.caption = cell(mapping.caption).trim();
    if (mapping.youtubeTitle >= 0) values.youtubeTitle = cell(mapping.youtubeTitle).trim();
    if (mapping.date >= 0 && cell(mapping.date).trim()) {
      const d = parseCsvDateTime(
        cell(mapping.date),
        mapping.time >= 0 ? cell(mapping.time) : null,
        fallbackTime,
      );
      if (d) values.scheduledAt = d;
      else badDates += 1;
    }
    byFileId.set(fileId, values);
  });

  return { byFileId, matched: byFileId.size, unmatchedRows, badDates, byName };
}
