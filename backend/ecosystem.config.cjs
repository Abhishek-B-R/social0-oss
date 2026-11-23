// PM2 process declaration for the API VM. The deploy workflow
// (.github/workflows/deploy-backend.yml) runs `pm2 startOrReload` on this file.
//
// kill_timeout is the point of this file. PM2 sends SIGINT on reload, then
// SIGKILL once kill_timeout passes (PM2's default is 1.6 s). The API waits up
// to SHUTDOWN_DEADLINE_MS (135 s, server/src/lib/graceful-shutdown.ts) for the
// X/TikTok/Bluesky publishes it runs in-process. A shorter kill_timeout kills
// them mid-upload, and a Retry can then post the same tweet twice.
// server/src/tests/pm2-kill-timeout.test.ts keeps the two numbers in step.
//
// The background worker's shutdown waits for active BullMQ jobs (a
// publish-scheduled scan, a repost run), so it gets the same budget.
//
// Fork mode, one instance each: a reload stops the API before starting it
// again, so it does not take requests while it drains.

const path = require("node:path");

/** Must stay above SHUTDOWN_DEADLINE_MS in server/src/lib/graceful-shutdown.ts. */
const KILL_TIMEOUT_MS = 150_000;

module.exports = {
  apps: [
    {
      name: "social0-api",
      cwd: path.join(__dirname, "server"),
      // Run the source through tsx, like `npm start`: the tsc output keeps
      // directory imports (e.g. ./db), which plain Node ESM refuses to load.
      script: "src/index.ts",
      interpreter: "node",
      node_args: ["--import", "tsx"],
      exec_mode: "fork",
      instances: 1,
      kill_timeout: KILL_TIMEOUT_MS,
    },
    {
      name: "social0-worker",
      cwd: path.join(__dirname, "background-worker"),
      script: "dist/main.js",
      exec_mode: "fork",
      instances: 1,
      kill_timeout: KILL_TIMEOUT_MS,
    },
  ],
};
