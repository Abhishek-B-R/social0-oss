import chalk from "chalk";
import type { Social0ApiError } from "../api/client.js";

const ERROR_HINTS: Record<string, string> = {
  invalid_api_key: "Your API key is invalid or expired. Run `social0 login` to set a new key.",
  forbidden: "You don't have permission for this action. Check your subscription plan.",
  not_found: "The requested resource was not found.",
  validation_error: "The request data is invalid. Check your input and try again.",
  rate_limit_exceeded: "Rate limit exceeded. Wait a moment and try again.",
  idempotency_conflict: "A duplicate publish request is already in progress.",
};

export function formatApiError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  if (err.name === "Social0ApiError") {
    const apiErr = err as Social0ApiError;
    const code = apiErr.code ?? "unknown";
    const hint = ERROR_HINTS[code];
    const lines = [
      chalk.red.bold("Error:"),
      "",
      apiErr.message,
    ];

    if (hint) {
      lines.push("", chalk.dim("Hint:"), hint);
    }

    if (code === "invalid_api_key" || apiErr.message.toLowerCase().includes("expired")) {
      lines.push("", chalk.dim("Reconnect accounts:"), "  social0 accounts connect <platform>");
    }

    if (apiErr.status === 429) {
      lines.push("", chalk.dim("You can also use --verbose to see retry details."));
    }

    return lines.join("\n");
  }

  if (err.message.includes("fetch failed") || err.message.includes("ECONNREFUSED")) {
    return [
      chalk.red.bold("Unable to connect to Social0 API."),
      "",
      "Check your internet connection and API URL:",
      "  social0 config get apiUrl",
      "",
      "Or run diagnostics:",
      "  social0 doctor",
    ].join("\n");
  }

  return err.message;
}

export function exitWithError(err: unknown): never {
  console.error(formatApiError(err));
  process.exit(1);
}
