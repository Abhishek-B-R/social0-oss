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

  console.error(`AI command "${action}" is not available yet.`);
  console.error("It will work once the Social0 API exposes /v1/ai endpoints.");
  if (format === "json") {
    printOutput({ available: false, action, content }, format);
  }
  process.exit(1);
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

Launching Social0 today`);
}
