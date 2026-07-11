import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { postCreateCommand } from "./post.js";
import { publishCommand } from "./publish.js";
import { scheduleCommand } from "./schedule.js";
import { accountsCommand } from "./accounts.js";
import { uploadCommand } from "./upload.js";
import { configCommand } from "./config.js";
import { draftsCommand } from "./drafts.js";
import { whoamiCommand } from "./whoami.js";
import type { GlobalOptions } from "../types/index.js";

export async function interactiveCommand(opts: GlobalOptions): Promise<void> {
  console.log("");
  console.log(chalk.bold.cyan("  Social0 CLI"));
  console.log(chalk.dim("  Manage your social media from the terminal"));
  console.log("");

  while (true) {
    const action = await select({
      message: "What would you like to do?",
      choices: [
        { name: "Create Post", value: "create" },
        { name: "Publish", value: "publish" },
        { name: "Schedule", value: "schedule" },
        { name: "Drafts", value: "drafts" },
        { name: "Accounts", value: "accounts" },
        { name: "Upload Media", value: "upload" },
        { name: "Who Am I", value: "whoami" },
        { name: "Settings", value: "config" },
        { name: "Exit", value: "exit" },
      ],
    });

    if (action === "exit") {
      console.log(chalk.dim("Goodbye!"));
      break;
    }

    console.log("");

    try {
      switch (action) {
        case "create":
          await postCreateCommand(opts);
          break;
        case "publish":
          await publishCommand(undefined, opts);
          break;
        case "schedule": {
          const { input: inquirerInput } = await import("@inquirer/prompts");
          const time = await inquirerInput({ message: 'When? (e.g. "tomorrow 9am"):' });
          await scheduleCommand(undefined, { ...opts, time });
          break;
        }
        case "drafts":
          await draftsCommand(undefined, undefined, opts);
          break;
        case "accounts":
          await accountsCommand(undefined, undefined, opts);
          break;
        case "upload": {
          const { input } = await import("@inquirer/prompts");
          const file = await input({ message: "File path to upload:" });
          if (file) await uploadCommand([file], opts);
          break;
        }
        case "whoami":
          await whoamiCommand(opts);
          break;
        case "config":
          await configCommand(undefined, undefined, undefined, opts);
          break;
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("User force closed")) {
        break;
      }
      console.error(err instanceof Error ? err.message : err);
    }

    console.log("");
  }
}
