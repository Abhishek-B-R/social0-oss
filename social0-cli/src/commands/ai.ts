import { getClient } from "../api/client.js";
import { exitWithError } from "../utils/errors.js";
import { printOutput } from "../utils/output.js";
import { applyGlobalOptions, getFormat } from "./helpers.js";
import type { GlobalOptions } from "../types/index.js";

export async function aiCommand(
  action: "suggest" | "improve" | "hashtags",
  content: string | undefined,
  opts: GlobalOptions,
): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  if (!content) {
    console.error(`Usage: social0 ${action} "<content>"`);
    process.exit(1);
  }

  try {
    const result = await getClient().post<Record<string, unknown>>(`/ai/${action}`, { content });
    printOutput(result, format);
  } catch (err) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 404) {
      console.error(`AI feature "${action}" is not yet available on the API.`);
      console.error("This command will work once the backend endpoint is enabled.");
      process.exit(1);
    }
    exitWithError(err);
  }
}

export function examplesCommand(): void {
  const examples = {
    login: "social0 login",
    accounts: "social0 accounts",
    createPost: 'social0 post create --content "Launching today!" --platform twitter linkedin',
    interactiveCreate: "social0 post create",
    publish: "social0 publish",
    publishDraft: "social0 publish <draft-id>",
    publishMarkdown: "social0 publish launch.md",
    schedule: 'social0 schedule <draft-id> --time "tomorrow 9am"',
    upload: "social0 upload logo.png",
    status: "social0 status <tracking-id>",
    pipe: 'echo "Hello world" | social0 publish',
    json: "social0 accounts --json",
    doctor: "social0 doctor",
  };

  console.log(JSON.stringify(examples, null, 2));
  console.log("");
  console.log("Sample post template:");
  console.log("");
  console.log(`---
platforms:
  - twitter
  - linkedin
schedule: tomorrow 9am
---

Launching Social0 today 🚀`);
}
