import chalk from "chalk";
import { listWorkspaces } from "../api/workspaces.js";
import { loadConfig, saveConfig, resolveWorkspaceId } from "../config/settings.js";
import { printOutput, success, info } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { applyGlobalOptions, getFormat } from "./helpers.js";
import type { GlobalOptions } from "../types/index.js";

export async function workspacesCommand(
  action: string | undefined,
  id: string | undefined,
  opts: GlobalOptions & { personal?: boolean },
): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  try {
    if (!action || action === "list") {
      const workspaces = await listWorkspaces();
      if (format !== "table") {
        printOutput(workspaces, format);
        return;
      }
      if (workspaces.length === 0) {
        info("You are not in any team workspaces. Commands act on your personal accounts.");
        return;
      }
      const current = resolveWorkspaceId();
      printOutput(
        workspaces.map((w) => ({
          " ": w.id === current ? "*" : "",
          ID: w.id,
          WORKSPACE: w.name,
          TEAM: w.team_name,
          ROLE: w.role,
          STATUS: w.active ? "active" : "paused",
          PERMISSIONS: w.permissions.join(", "),
        })),
        "table",
      );
      console.log("");
      console.log(chalk.dim("  Use one per command with --workspace <id>, or by default with `social0 workspaces use <id>`."));
      return;
    }

    if (action === "use") {
      const config = loadConfig();
      if (opts.personal) {
        delete config.defaultWorkspace;
        saveConfig(config);
        success("Default cleared: commands act on your personal accounts.");
        return;
      }
      if (!id) {
        console.error("Usage: social0 workspaces use <id> | --personal");
        process.exit(1);
      }
      const match = (await listWorkspaces()).find((w) => w.id === id);
      if (!match) {
        console.error(`Workspace ${id} not found. Run \`social0 workspaces\` to see yours.`);
        process.exit(1);
      }
      config.defaultWorkspace = match.id;
      saveConfig(config);
      success(`Default workspace: ${match.team_name} / ${match.name} (${match.role}).`);
      return;
    }

    if (action === "current") {
      const current = resolveWorkspaceId() ?? null;
      if (format !== "table") printOutput({ workspace_id: current }, format);
      else console.log(current ?? "personal");
      return;
    }

    console.error(`Unknown workspaces action: ${action}`);
    process.exit(1);
  } catch (err) {
    exitWithError(err);
  }
}
