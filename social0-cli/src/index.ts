#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { whoamiCommand } from "./commands/whoami.js";
import { passphraseCommand } from "./commands/passphrase.js";
import { configCommand } from "./commands/config.js";
import { accountsCommand } from "./commands/accounts.js";
import {
  postCreateCommand,
  postListCommand,
  postShowCommand,
  postEditCommand,
  postDeleteCommand,
  postInitCommand,
} from "./commands/post.js";
import { publishCommand } from "./commands/publish.js";
import { scheduleCommand } from "./commands/schedule.js";
import { uploadCommand } from "./commands/upload.js";
import { statusCommand } from "./commands/status.js";
import { draftsCommand } from "./commands/drafts.js";
import { doctorCommand, versionCommand, updateCommand } from "./commands/doctor.js";
import { interactiveCommand } from "./commands/interactive.js";
import { aiCommand, examplesCommand } from "./commands/ai.js";
import {
  linkCommand,
  watchCommand,
  logsCommand,
  exportCommand,
  importCommand,
} from "./commands/extras.js";
import { generateCompletion } from "./commands/completion.js";
import { formatApiError } from "./utils/errors.js";
import type { GlobalOptions } from "./types/index.js";

const program = new Command();

program
  .name("social0")
  .description(chalk.bold("Social0 CLI") + " — manage social media from your terminal")
  .version("0.1.0")
  .option("--json", "Output as JSON")
  .option("--yaml", "Output as YAML")
  .option("--table", "Output as table (default)")
  .option("--verbose", "Verbose logging")
  .option("--api-url <url>", "Override API URL")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts<GlobalOptions>();
    if (opts.apiUrl) {
      process.env.SOCIAL0_API_URL = opts.apiUrl;
    }
  });

function globalOpts(cmd: Command): GlobalOptions {
  const root = cmd.optsWithGlobals<GlobalOptions>();
  return {
    json: root.json,
    yaml: root.yaml,
    table: root.table,
    verbose: root.verbose,
    apiUrl: root.apiUrl,
  };
}

// Auth
program
  .command("login")
  .description("Authenticate with your Social0 API key (stdin or masked prompt)")
  .option("--require-passphrase", "Require a local encryption passphrase (when OS keychain is unavailable)")
  .option("--skip-passphrase", "Skip passphrase; store API key in a local file (mode 0600)")
  .action(async (opts) => {
    try {
      await loginCommand({
        passphrase: !!opts.requirePassphrase,
        noPassphrase: !!opts.skipPassphrase,
      });
    } catch (err) {
      console.error(formatApiError(err));
      process.exit(1);
    }
  });

program
  .command("logout")
  .description("Remove stored credentials")
  .action(async () => {
    await logoutCommand();
  });

program
  .command("whoami")
  .description("Show current authentication status")
  .action(async (_, cmd) => {
    try {
      await whoamiCommand(globalOpts(cmd));
    } catch (err) {
      console.error(formatApiError(err));
      process.exit(1);
    }
  });

program
  .command("passphrase")
  .description("Manage optional local credential passphrase")
  .argument("[action]", "status, set, or remove")
  .action(async (action) => {
    await passphraseCommand(action);
  });

// Config
const configCmd = program
  .command("config")
  .description("Manage CLI configuration")
  .argument("[action]", "list, get, or set")
  .argument("[key]", "Config key")
  .argument("[value]", "Config value")
  .action(async (action, key, value, _, cmd) => {
    await configCommand(action, key, value, globalOpts(cmd));
  });

// Accounts
const accountsCmd = program
  .command("accounts")
  .description("Manage connected social accounts")
  .argument("[action]", "list, connect, or disconnect")
  .argument("[platform-or-id]", "Platform name or account ID")
  .action(async (action, arg, _, cmd) => {
    await accountsCommand(action, arg, globalOpts(cmd));
  });

// Posts
const postCmd = program.command("post").description("Create and manage posts");

postCmd
  .command("create")
  .description("Create a new post (interactive if args missing)")
  .option("-c, --content <text>", "Post content")
  .option("-p, --platform <platforms...>", "Platforms or account IDs (1, 2, twitter, linkedin)")
  .option("-m, --media <ids...>", "Media IDs")
  .option("-s, --schedule <time>", "Schedule time (natural language)")
  .option("--publish", "Publish immediately instead of saving draft")
  .action(async (opts, cmd) => {
    await postCreateCommand({ ...globalOpts(cmd), ...opts });
  });

postCmd
  .command("list")
  .description("List posts")
  .option("--status <status>", "Filter by status")
  .action(async (opts, cmd) => {
    await postListCommand({ ...globalOpts(cmd), ...opts });
  });

postCmd
  .command("show <id>")
  .description("Show post details")
  .action(async (id, _, cmd) => {
    await postShowCommand(id, globalOpts(cmd));
  });

postCmd
  .command("edit <id>")
  .description("Edit a post")
  .option("-c, --content <text>", "New content")
  .option("-p, --platform <platforms...>", "Platforms or account IDs")
  .action(async (id, opts, cmd) => {
    await postEditCommand(id, { ...globalOpts(cmd), ...opts });
  });

postCmd
  .command("delete <id>")
  .description("Delete a post")
  .action(async (id, _, cmd) => {
    await postDeleteCommand(id, globalOpts(cmd));
  });

postCmd
  .command("init")
  .description("Generate a sample post JSON template")
  .action(async () => {
    await postInitCommand({});
  });

// Publish
program
  .command("publish [target]")
  .description("Publish a post, draft, markdown file, or stdin content")
  .option("-c, --content <text>", "Post content")
  .option("-p, --platform <platforms...>", "Platforms or account IDs")
  .option("-m, --media <ids...>", "Media IDs")
  .action(async (target, opts, cmd) => {
    await publishCommand(target, { ...globalOpts(cmd), ...opts });
  });

// Schedule
program
  .command("schedule [target]")
  .description("Schedule a post for later")
  .option("-t, --time <when>", "When to publish (natural language)")
  .option("-c, --content <text>", "Post content")
  .option("-p, --platform <platforms...>", "Platforms or account IDs")
  .action(async (target, opts, cmd) => {
    await scheduleCommand(target, { ...globalOpts(cmd), ...opts });
  });

// Upload
program
  .command("upload <files...>")
  .description("Upload media files")
  .action(async (files, _, cmd) => {
    await uploadCommand(files, globalOpts(cmd));
  });

// Status
program
  .command("status <tracking-id>")
  .description("Check publish job status (live polling)")
  .option("-w, --watch", "Keep watching until complete")
  .action(async (trackingId, opts, cmd) => {
    await statusCommand(trackingId, { ...globalOpts(cmd), ...opts });
  });

// Drafts
const draftsCmd = program
  .command("drafts")
  .description("Manage draft posts")
  .argument("[action]", "list, delete, publish, or schedule")
  .argument("[id]", "Draft ID")
  .option("-t, --time <when>", "Schedule time")
  .action(async (action, id, opts, cmd) => {
    await draftsCommand(action, id, { ...globalOpts(cmd), ...opts });
  });

// Doctor / version / update
program
  .command("doctor")
  .description("Run diagnostics")
  .action(async (_, cmd) => {
    await doctorCommand(globalOpts(cmd));
  });

program
  .command("version")
  .description("Show CLI version")
  .action(() => {
    versionCommand();
  });

program
  .command("update")
  .description("Check for CLI updates")
  .action(async () => {
    await updateCommand();
  });

// AI features
program
  .command("suggest <content>")
  .description("Get AI content suggestions")
  .action(async (content, _, cmd) => {
    await aiCommand("suggest", content, globalOpts(cmd));
  });

program
  .command("improve <content>")
  .description("Improve content with AI")
  .action(async (content, _, cmd) => {
    await aiCommand("improve", content, globalOpts(cmd));
  });

program
  .command("hashtags <content>")
  .description("Generate hashtag suggestions")
  .action(async (content, _, cmd) => {
    await aiCommand("hashtags", content, globalOpts(cmd));
  });

// Extras
program
  .command("examples")
  .description("Show usage examples and sample templates")
  .action(() => {
    examplesCommand();
  });

program
  .command("link")
  .description("Link current directory to Social0 project settings")
  .action(async (_, cmd) => {
    await linkCommand(globalOpts(cmd));
  });

program
  .command("watch")
  .description("Monitor publishing queue")
  .action(async (_, cmd) => {
    await watchCommand(globalOpts(cmd));
  });

program
  .command("logs")
  .description("Stream live publishing events")
  .action(async (_, cmd) => {
    await logsCommand(globalOpts(cmd));
  });

program
  .command("export [file]")
  .description("Export posts to JSON")
  .action(async (file, _, cmd) => {
    await exportCommand(file, globalOpts(cmd));
  });

program
  .command("import <file>")
  .description("Import posts from JSON")
  .action(async (file, _, cmd) => {
    await importCommand(file, globalOpts(cmd));
  });

program
  .command("completion <shell>")
  .description("Generate shell completions (bash, zsh, fish, powershell)")
  .action((shell) => {
    console.log(generateCompletion(shell));
  });

// Default: interactive mode
if (process.argv.length <= 2) {
  interactiveCommand({}).catch((err) => {
    console.error(formatApiError(err));
    process.exit(1);
  });
} else {
  program.parse();
}
