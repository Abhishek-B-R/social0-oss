/**
 * The publish drain (graceful-shutdown.ts) waits up to SHUTDOWN_DEADLINE_MS for
 * in-process X/TikTok/Bluesky publishes, but the deploy ran a bare
 * `pm2 reload all` with no kill_timeout anywhere, so PM2 SIGKILLed the API
 * 1.6 s into the drain. The publish was left `publishing`, and a Retry could
 * post a tweet X had already accepted a second time. The kill timeout now
 * lives in backend/ecosystem.config.cjs, the deploy reloads through it, and
 * the API logs an error at boot when PM2 would still kill it too early.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

// The drain itself is covered by server-publish-drain.test.ts; keep the
// publish engine (and its imports) out of this one.
vi.mock("../publish/server-platform-jobs.js", () => ({
  drainServerPublishJobs: vi.fn(),
  serverPublishJobsInFlight: vi.fn(() => 0),
}));

import {
  PM2_DEFAULT_KILL_TIMEOUT_MS,
  SHUTDOWN_DEADLINE_MS,
  pm2KillTimeoutMs,
  warnIfKillTimeoutTooShort,
} from "../lib/graceful-shutdown.js";

type Pm2App = { name: string; script: string; kill_timeout?: number };

const require = createRequire(import.meta.url);
const ecosystem = require("../../../ecosystem.config.cjs") as { apps: Pm2App[] };
const deployWorkflow = readFileSync(
  fileURLToPath(
    new URL("../../../../.github/workflows/deploy-backend.yml", import.meta.url),
  ),
  "utf8",
);

describe("PM2 ecosystem", () => {
  it("gives the API a kill_timeout longer than its shutdown deadline", () => {
    const api = ecosystem.apps.find((app) => app.name === "social0-api");
    expect(api?.script).toBe("dist/index.js");
    expect(api?.kill_timeout).toBeGreaterThan(SHUTDOWN_DEADLINE_MS);
  });

  it("gives the background worker the same budget for its active jobs", () => {
    const worker = ecosystem.apps.find((app) => app.name === "social0-worker");
    expect(worker?.script).toBe("dist/main.js");
    expect(worker?.kill_timeout).toBeGreaterThan(SHUTDOWN_DEADLINE_MS);
  });

  it("is what the deploy reloads, not a bare reload with PM2's default", () => {
    expect(deployWorkflow).toContain("pm2 startOrReload ecosystem.config.cjs");
    expect(deployWorkflow).not.toMatch(/^\s*pm2 reload all\s*$/m);
    for (const app of ecosystem.apps) {
      expect(deployWorkflow).toContain(app.name);
    }
    // The VM also runs the dev API and other projects.
    expect(deployWorkflow).not.toMatch(/pm2 delete all/);
  });
});

describe("pm2KillTimeoutMs", () => {
  it("is null outside PM2", () => {
    expect(pm2KillTimeoutMs({})).toBeNull();
  });

  it("reads the app's own kill_timeout", () => {
    expect(pm2KillTimeoutMs({ pm_id: "0", kill_timeout: "150000" })).toBe(150_000);
  });

  it("falls back to the daemon-wide timeout, then PM2's default", () => {
    expect(pm2KillTimeoutMs({ pm_id: "0", PM2_KILL_TIMEOUT: "9000" })).toBe(9_000);
    expect(pm2KillTimeoutMs({ pm_id: "0" })).toBe(PM2_DEFAULT_KILL_TIMEOUT_MS);
    expect(pm2KillTimeoutMs({ pm_id: "0", kill_timeout: "nope" })).toBe(
      PM2_DEFAULT_KILL_TIMEOUT_MS,
    );
  });
});

describe("warnIfKillTimeoutTooShort", () => {
  function appWithErrorSpy() {
    const app = Fastify();
    const error = vi.spyOn(app.log, "error").mockImplementation(() => {});
    return { app, error };
  }

  it("logs an error when PM2 runs the API on its default kill_timeout", () => {
    const { app, error } = appWithErrorSpy();
    warnIfKillTimeoutTooShort(app, { pm_id: "0" });
    expect(error).toHaveBeenCalledWith(
      {
        killTimeoutMs: PM2_DEFAULT_KILL_TIMEOUT_MS,
        shutdownDeadlineMs: SHUTDOWN_DEADLINE_MS,
      },
      expect.stringContaining("ecosystem.config.cjs"),
    );
  });

  it("stays quiet under the ecosystem's kill_timeout, and outside PM2", () => {
    const { app, error } = appWithErrorSpy();
    const declared = ecosystem.apps.find((a) => a.name === "social0-api")!;
    warnIfKillTimeoutTooShort(app, {
      pm_id: "0",
      kill_timeout: String(declared.kill_timeout),
    });
    warnIfKillTimeoutTooShort(app, {});
    expect(error).not.toHaveBeenCalled();
  });
});
