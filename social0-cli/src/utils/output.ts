import chalk from "chalk";
import YAML from "yaml";
import type { OutputFormat } from "../types/index.js";

/**
 * Strip anything a terminal would interpret from untrusted text.
 *
 * Comment and DM bodies come from arbitrary social users. An ANSI CSI/OSC
 * sequence in one of them (colour, cursor moves, OSC 52 clipboard writes,
 * title changes) would execute the moment the operator lists their inbox.
 * JSON output is safe (JSON.stringify escapes control characters); every
 * table, key/value, and free-form line goes through here.
 */
export function sanitizeForTerminal(value: string): string {
  return (
    value
      // ESC-introduced sequences: CSI (ESC [ ... final), OSC (ESC ] ... BEL/ST),
      // and two-byte ESC x forms (charset selects, ESC c reset, ...).
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
      .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g, "")
      .replace(/\u001b[@-Z\\-_]?/g, "")
      // 8-bit C1 controls (CSI 0x9b, OSC 0x9d, ST 0x9c, ...).
      .replace(/[\u0080-\u009f]/g, "")
      // Remaining C0 controls and DEL; keep the line readable on one row.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .replace(/[\t\n\r]+/g, " ")
  );
}

function cellText(value: unknown): string {
  return sanitizeForTerminal(String(value ?? ""));
}

export function printOutput(data: unknown, format: OutputFormat): void {
  switch (format) {
    case "json":
      console.log(JSON.stringify(data, null, 2));
      break;
    case "yaml":
      console.log(YAML.stringify(data));
      break;
    case "table":
      if (Array.isArray(data)) {
        printTable(data as Record<string, unknown>[]);
      } else if (typeof data === "object" && data !== null) {
        printKeyValue(data as Record<string, unknown>);
      } else {
        console.log(cellText(data));
      }
      break;
  }
}

export function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log(chalk.dim("No results."));
    return;
  }

  const columns = Object.keys(rows[0]);
  const widths = columns.map((col) =>
    Math.max(col.length, ...rows.map((r) => cellText(r[col]).length)),
  );

  const header = columns.map((col, i) => chalk.bold(col.toUpperCase().padEnd(widths[i]))).join("  ");
  const divider = columns.map((_, i) => "─".repeat(widths[i])).join("  ");

  console.log(header);
  console.log(chalk.dim(divider));

  for (const row of rows) {
    const line = columns
      .map((col, i) => {
        const val = cellText(row[col]);
        return formatCell(col, val).padEnd(widths[i]);
      })
      .join("  ");
    console.log(line);
  }
}

function formatCell(column: string, value: string): string {
  const lower = column.toLowerCase();
  if (lower === "status" || lower === "token_status") {
    if (value === "success" || value === "published" || value === "active" || value === "completed") {
      return chalk.green(value);
    }
    if (value === "failed" || value === "expired" || value === "error") {
      return chalk.red(value);
    }
    if (value === "partial") return chalk.yellow(value);
    if (value === "publishing" || value === "processing" || value === "queued" || value === "pending") {
      return chalk.yellow(value);
    }
    if (value === "draft" || value === "scheduled") return chalk.cyan(value);
  }
  return value;
}

function printKeyValue(obj: Record<string, unknown>): void {
  const maxKey = Math.max(...Object.keys(obj).map((k) => k.length));
  for (const [key, value] of Object.entries(obj)) {
    console.log(`${chalk.bold(key.padEnd(maxKey))}  ${formatValue(value)}`);
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return chalk.dim("—");
  if (typeof value === "boolean") return value ? chalk.green("yes") : chalk.red("no");
  if (Array.isArray(value)) return sanitizeForTerminal(value.join(", "));
  if (typeof value === "object") return sanitizeForTerminal(JSON.stringify(value));
  return cellText(value);
}

// Status lines often embed platform-supplied text (fetch errors, notices,
// author names); scrub those too so no path prints untrusted bytes raw.
export function success(message: string): void {
  console.log(chalk.green("✓"), sanitizeForTerminal(message));
}

export function error(message: string): void {
  console.error(chalk.red("✗"), sanitizeForTerminal(message));
}

export function info(message: string): void {
  console.log(chalk.blue("→"), sanitizeForTerminal(message));
}

export function warn(message: string): void {
  console.log(chalk.yellow("!"), sanitizeForTerminal(message));
}

export function platformStatusIcon(phase: string): string {
  if (phase === "platform_success" || phase === "completed" || phase === "published") {
    return chalk.green("✓");
  }
  if (phase === "platform_failed" || phase === "failed") {
    return chalk.red("✗");
  }
  return chalk.yellow("⟳");
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}
