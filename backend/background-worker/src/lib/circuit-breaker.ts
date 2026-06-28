import type { ConnectionOptions } from "bullmq";
import type { SupportedPlatform } from "@social0/shared";

const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const OPEN_THRESHOLD = 5;
const OPEN_DURATION_MS = 2 * 60 * 1000;

type PlatformState = {
  failures: number[];
  openUntil: number;
};

const state = new Map<SupportedPlatform, PlatformState>();

function getState(platform: SupportedPlatform): PlatformState {
  let s = state.get(platform);
  if (!s) {
    s = { failures: [], openUntil: 0 };
    state.set(platform, s);
  }
  return s;
}

export function isCircuitOpen(platform: SupportedPlatform): boolean {
  const s = getState(platform);
  return Date.now() < s.openUntil;
}

export function recordCircuitSuccess(platform: SupportedPlatform) {
  const s = getState(platform);
  s.failures = [];
  s.openUntil = 0;
}

export function recordCircuitFailure(platform: SupportedPlatform) {
  const now = Date.now();
  const s = getState(platform);
  s.failures = s.failures.filter((t) => now - t < FAILURE_WINDOW_MS);
  s.failures.push(now);
  if (s.failures.length >= OPEN_THRESHOLD) {
    s.openUntil = now + OPEN_DURATION_MS;
    console.warn(
      `[circuit] opened for ${platform} until ${new Date(s.openUntil).toISOString()}`,
    );
  }
}

/** Reserved for future Redis-backed circuit state across worker replicas. */
export function initCircuitBreaker(_connection: ConnectionOptions) {
  /* no-op - in-process breaker per worker instance */
}
