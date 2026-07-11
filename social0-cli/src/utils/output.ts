import chalk from "chalk";
import YAML from "yaml";
import type { OutputFormat } from "../types/index.js";

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
        console.log(String(data));
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
    Math.max(col.length, ...rows.map((r) => String(r[col] ?? "").length)),
  );

  const header = columns.map((col, i) => chalk.bold(col.toUpperCase().padEnd(widths[i]))).join("  ");
  const divider = columns.map((_, i) => "─".repeat(widths[i])).join("  ");

  console.log(header);
  console.log(chalk.dim(divider));

  for (const row of rows) {
    const line = columns
      .map((col, i) => {
        const val = String(row[col] ?? "");
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
    if (value === "publishing" || value === "processing" || value === "queued" || value === "pending") {
      return chalk.yellow(value);
    }
    if (value === "partial") return chalk.yellow(value);
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
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function success(message: string): void {
  console.log(chalk.green("✓"), message);
}

export function error(message: string): void {
  console.error(chalk.red("✗"), message);
}

export function info(message: string): void {
  console.log(chalk.blue("→"), message);
}

export function warn(message: string): void {
  console.log(chalk.yellow("!"), message);
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
