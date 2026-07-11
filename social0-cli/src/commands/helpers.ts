import { checkbox, confirm, input, password, select } from "@inquirer/prompts";
import ora from "ora";
import type { GlobalOptions } from "../types/index.js";
import { resolveOutputFormat } from "../config/settings.js";
import { setVerbose } from "../utils/verbose.js";
import { listAccounts } from "../api/accounts.js";
import {
  buildAliases,
  formatAccountLabel,
  formatPlatformName,
  setAccountCache,
} from "../utils/aliases.js";
import { loadConfig } from "../config/settings.js";

export function applyGlobalOptions(opts: GlobalOptions): void {
  setVerbose(!!opts.verbose);
}

export function getFormat(opts: GlobalOptions) {
  return resolveOutputFormat(opts);
}

export async function ensureAccounts(): Promise<ReturnType<typeof buildAliases>> {
  const accounts = await listAccounts();
  setAccountCache(accounts);
  return buildAliases(accounts);
}

export async function promptAccountSelection(message = "Which accounts should this post be sent to?"): Promise<string[]> {
  const aliases = await ensureAccounts();
  if (aliases.length === 0) {
    throw new Error("No connected accounts. Run `social0 accounts connect <platform>` first.");
  }

  const selected = await checkbox({
    message,
    choices: aliases.map((a) => ({
      name: formatAccountLabel(a),
      value: a.account.id,
      checked: a.account.is_active && a.account.token_status === "active",
    })),
    pageSize: 15,
  });

  if (selected.length === 0) {
    throw new Error("Select at least one account.");
  }
  return selected;
}

export async function promptContent(defaultValue = ""): Promise<string> {
  const content = await input({
    message: "What is the post content?",
    default: defaultValue || undefined,
  });
  if (!content.trim()) throw new Error("Content cannot be empty.");
  return content.trim();
}

export async function promptSchedule(): Promise<string | undefined> {
  const schedule = await input({
    message: "When should this post be sent? (leave blank for now)",
  });
  return schedule.trim() || undefined;
}

export async function promptApiKey(): Promise<string> {
  const key = await password({
    message: "Enter your Social0 API key (sk_live_...)",
    mask: "•",
    validate: (v) => {
      if (!v.startsWith("sk_live_") && !v.startsWith("s0_live_")) {
        return "API key must start with sk_live_";
      }
      return true;
    },
  });
  return key;
}

export async function withSpinner<T>(text: string, fn: () => Promise<T>): Promise<T> {
  const spinner = ora(text).start();
  try {
    const result = await fn();
    spinner.succeed();
    return result;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

export function formatAccountsTable(aliases: ReturnType<typeof buildAliases>) {
  return aliases.map((a) => ({
    ID: a.alias,
    PLATFORM: formatPlatformName(a.account.platform),
    NAME: a.account.username ?? "—",
    HANDLE: a.account.username ? `@${a.account.username}` : "—",
    STATUS: a.account.token_status,
  }));
}

export function getTimezone(): string {
  return loadConfig().defaultTimezone;
}

export async function confirmAction(message: string): Promise<boolean> {
  return confirm({ message, default: false });
}

export async function selectFromList<T extends string>(
  message: string,
  choices: Array<{ name: string; value: T }>,
): Promise<T> {
  return select({ message, choices });
}
