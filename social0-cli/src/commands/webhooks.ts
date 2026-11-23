import chalk from "chalk";
import {
  WEBHOOK_EVENTS,
  listWebhooks,
  createWebhook,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  listWebhookDeliveries,
  testWebhook,
} from "../api/webhooks.js";
import { printOutput, success, info, warn } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { applyGlobalOptions, confirmAction, getFormat, withSpinner } from "./helpers.js";
import type { GlobalOptions } from "../types/index.js";

interface WebhooksOptions extends GlobalOptions {
  url?: string;
  events?: string[];
  enable?: boolean;
  disable?: boolean;
  limit?: string;
  before?: string;
  yes?: boolean;
}

function usage(line: string): never {
  console.error(`Usage: social0 webhooks ${line}`);
  process.exit(1);
}

export async function webhooksCommand(
  action: string | undefined,
  id: string | undefined,
  opts: WebhooksOptions,
): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  try {
    if (!action || action === "list") {
      const hooks = await listWebhooks();
      if (format !== "table") return printOutput(hooks, format);
      if (hooks.length === 0) {
        info("No webhooks. Create one: social0 webhooks create --url https://... --events post.published");
        return;
      }
      printOutput(
        hooks.map((h) => ({
          ID: h.id,
          URL: h.url,
          EVENTS: h.events.join(", "),
          ACTIVE: h.active ? "yes" : "no",
          "LAST DELIVERY": h.last_delivery_status
            ? `${h.last_delivery_status}${h.last_delivery_response_status ? ` (${h.last_delivery_response_status})` : ""}`
            : "—",
        })),
        "table",
      );
      return;
    }

    if (action === "create") {
      if (!opts.url || !opts.events?.length) {
        usage(`create --url <https-url> --events <${WEBHOOK_EVENTS.join("|")}...>`);
      }
      const created = await withSpinner("Creating webhook...", () =>
        createWebhook({ url: opts.url!, events: opts.events! }),
      );
      if (format !== "table") return printOutput(created, format);
      success(`Webhook created (ID: ${created.id})`);
      console.log("");
      console.log(`  Signing secret: ${chalk.bold(created.secret)}`);
      console.log(chalk.yellow("  Save it now: it is shown only once."));
      return;
    }

    if (!id) usage(`${action} <id>`);

    if (action === "show") {
      return printOutput(await getWebhook(id), format);
    }

    if (action === "update") {
      const payload: { url?: string; events?: string[]; active?: boolean } = {};
      if (opts.url) payload.url = opts.url;
      if (opts.events?.length) payload.events = opts.events;
      if (opts.enable) payload.active = true;
      if (opts.disable) payload.active = false;
      if (Object.keys(payload).length === 0) {
        usage("update <id> [--url <url>] [--events <events...>] [--enable|--disable]");
      }
      const updated = await withSpinner("Updating webhook...", () => updateWebhook(id, payload));
      if (format !== "table") return printOutput(updated, format);
      success("Webhook updated.");
      return;
    }

    if (action === "delete") {
      if (!opts.yes && !(await confirmAction(`Delete webhook ${id}?`))) return;
      await withSpinner("Deleting webhook...", () => deleteWebhook(id));
      success("Webhook deleted.");
      return;
    }

    if (action === "deliveries") {
      const page = await listWebhookDeliveries(id, {
        limit: opts.limit !== undefined ? Number(opts.limit) : undefined,
        before: opts.before,
      });
      if (format !== "table") return printOutput(page, format);
      printOutput(
        page.data.map((d) => ({
          TIME: new Date(d.created_at).toLocaleString(),
          EVENT: d.event,
          STATUS: d.status,
          HTTP: d.response_status ?? "—",
          ATTEMPTS: d.attempts,
          ERROR: d.error ?? "—",
        })),
        "table",
      );
      if (page.next_before) {
        console.log("");
        console.log(chalk.dim(`  Older: social0 webhooks deliveries ${id} --before ${page.next_before}`));
      }
      return;
    }

    if (action === "test") {
      const result = await withSpinner("Sending test event...", () => testWebhook(id));
      if (format !== "table") return printOutput(result, format);
      if (result.status === "delivered") success(`Delivered (HTTP ${result.response_status}).`);
      else warn(`Delivery ${result.status}${result.response_status ? ` (HTTP ${result.response_status})` : ""}: ${result.error ?? "no error message"}`);
      return;
    }

    console.error(`Unknown webhooks action: ${action}`);
    process.exit(1);
  } catch (err) {
    exitWithError(err);
  }
}
