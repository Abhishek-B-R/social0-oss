import { format } from "date-fns";
import type {
  AutomationAutoPlug,
  AutomationPending,
  AutomationResurface,
} from "@/api/dashboard";

/*
 * Automations are stored per post today (no rule table). This file groups the
 * per-post rows from `dashboard.listAutomations` into "rules": every post that
 * shares the same settings becomes one rule, shown as a sentence
 * ("Reply with … after 100 likes on X"). Pure functions only.
 */

export type RuleKind = "autoplug" | "repost";

/** State of one post inside a rule. */
export type InstanceState =
  /** Auto-Plug watching / Auto-Repost active: will run. */
  | "active"
  /** Scheduled post: starts once the post publishes on X. */
  | "pending"
  /** Auto-Repost turned off but can be turned back on. */
  | "paused"
  /** Ran to completion (plug posted, all reposts done) or expired. */
  | "done"
  | "failed";

export type RuleInstance = {
  /** Unique key: `${kind}:${source}:${id}`. */
  key: string;
  kind: RuleKind;
  postId: string;
  postSnippet: string;
  state: InstanceState;
  /** Human status for the drawer ("Watching", "Plug posted", …). */
  statusLabel: string;
  /** Auto-Repost schedule id (live) or Auto-Plug id (live). Null for pending. */
  liveId: string | null;
  /** Pending rows come from scheduled-post metadata. */
  pending: AutomationPending | null;
  /** @handle the plug replies from (Auto-Plug only). */
  handle: string | null;
  runs: number;
  failedRuns: number;
  lastRunAt: string | null;
  lastRunStatus: "done" | "failed" | null;
  nextRunAt: string | null;
  scheduledAt: string | null;
  /** Can this instance be turned back on from here? */
  canResume: boolean;
};

export type AutomationRule = {
  key: string;
  kind: RuleKind;
  /** Auto-Plug */
  metricType?: string;
  threshold?: number;
  /** Auto-Repost */
  intervalHours?: number;
  maxResurfaces?: number;
  /** Reply text (Auto-Plug) or optional reply after each repost (Auto-Repost). */
  comment: string | null;
  instances: RuleInstance[];
  /** At least one instance is active or pending. */
  on: boolean;
  /** Something could be turned back on (paused Auto-Repost). */
  canResume: boolean;
  runs: number;
  failedRuns: number;
  lastRunAt: string | null;
  lastRunStatus: "done" | "failed" | null;
  nextRunAt: string | null;
  activeCount: number;
  pendingCount: number;
};

function normComment(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function earlier(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

const AUTOPLUG_STATUS_LABEL: Record<string, string> = {
  watching: "Watching",
  triggered: "Plug posted",
  expired: "Expired",
  failed: "Failed",
};

function autoPlugState(status: string): InstanceState {
  if (status === "watching") return "active";
  if (status === "failed") return "failed";
  return "done";
}

function plugKey(metricType: string, threshold: number, comment: string) {
  return `autoplug|${metricType === "retweets" ? "retweets" : "likes"}|${threshold}|${comment}`;
}

function repostKey(intervalHours: number, max: number, comment: string) {
  return `repost|${intervalHours}|${max}|${comment}`;
}

function emptyRule(
  key: string,
  kind: RuleKind,
  extra: Partial<AutomationRule>,
): AutomationRule {
  return {
    key,
    kind,
    comment: null,
    instances: [],
    on: false,
    canResume: false,
    runs: 0,
    failedRuns: 0,
    lastRunAt: null,
    lastRunStatus: null,
    nextRunAt: null,
    activeCount: 0,
    pendingCount: 0,
    ...extra,
  };
}

function addInstance(rule: AutomationRule, inst: RuleInstance) {
  rule.instances.push(inst);
  rule.runs += inst.runs;
  rule.failedRuns += inst.failedRuns;
  if (inst.state === "active") rule.activeCount += 1;
  if (inst.state === "pending") rule.pendingCount += 1;
  if (inst.state === "active" || inst.state === "pending") rule.on = true;
  if (inst.canResume) rule.canResume = true;
  const prevLast = rule.lastRunAt;
  rule.lastRunAt = later(rule.lastRunAt, inst.lastRunAt);
  if (rule.lastRunAt !== prevLast && inst.lastRunAt === rule.lastRunAt) {
    rule.lastRunStatus = inst.lastRunStatus;
  }
  if (inst.state === "active") {
    rule.nextRunAt = earlier(rule.nextRunAt, inst.nextRunAt);
  }
}

/** Group per-post rows into rules. Active rules first, then most recent run. */
export function buildRules(data: {
  autoPlugs: AutomationAutoPlug[];
  resurfaces: AutomationResurface[];
  pending: AutomationPending[];
}): AutomationRule[] {
  const rules = new Map<string, AutomationRule>();

  const plugRule = (metricType: string, threshold: number, comment: string) => {
    const key = plugKey(metricType, threshold, comment);
    let rule = rules.get(key);
    if (!rule) {
      rule = emptyRule(key, "autoplug", {
        metricType: metricType === "retweets" ? "retweets" : "likes",
        threshold,
        comment,
      });
      rules.set(key, rule);
    }
    return rule;
  };

  const repostRule = (intervalHours: number, max: number, comment: string) => {
    const key = repostKey(intervalHours, max, comment);
    let rule = rules.get(key);
    if (!rule) {
      rule = emptyRule(key, "repost", {
        intervalHours,
        maxResurfaces: max,
        comment: comment || null,
      });
      rules.set(key, rule);
    }
    return rule;
  };

  for (const p of data.autoPlugs) {
    const comment = normComment(p.plugComment);
    const state = autoPlugState(p.status);
    const ran = p.status === "triggered" || p.status === "failed";
    addInstance(plugRule(p.metricType, p.metricThreshold, comment), {
      key: `autoplug:live:${p.id}`,
      kind: "autoplug",
      postId: p.postId,
      postSnippet: p.postSnippet,
      state,
      statusLabel: AUTOPLUG_STATUS_LABEL[p.status] ?? p.status,
      liveId: p.id,
      pending: null,
      handle: p.platformUsername,
      runs: p.status === "triggered" ? 1 : 0,
      failedRuns: p.status === "failed" ? 1 : 0,
      lastRunAt: ran ? (p.updatedAt ?? p.createdAt) : null,
      lastRunStatus:
        p.status === "triggered" ? "done" : p.status === "failed" ? "failed" : null,
      nextRunAt: null,
      scheduledAt: null,
      canResume: false,
    });
  }

  for (const r of data.resurfaces) {
    const comment = normComment(r.plugComment);
    const finished = r.resurfacesDone >= r.maxResurfaces;
    const state: InstanceState = r.isActive
      ? "active"
      : finished
        ? "done"
        : "paused";
    addInstance(repostRule(r.intervalHours, r.maxResurfaces, comment), {
      key: `repost:live:${r.id}`,
      kind: "repost",
      postId: r.postId,
      postSnippet: r.postSnippet,
      state,
      statusLabel: r.isActive
        ? `${r.resurfacesDone} of ${r.maxResurfaces} reposts done`
        : finished
          ? `All ${r.maxResurfaces} reposts done`
          : "Off",
      liveId: r.id,
      pending: null,
      handle: null,
      runs: r.runsDone,
      failedRuns: r.runsFailed,
      lastRunAt: r.lastRunAt,
      lastRunStatus: r.lastRunStatus,
      nextRunAt: r.nextRunAt,
      scheduledAt: null,
      canResume: !r.isActive && !finished,
    });
  }

  for (const p of data.pending) {
    if (p.autoPlug) {
      addInstance(
        plugRule(p.autoPlug.metricType, p.autoPlug.threshold, normComment(p.autoPlug.plugComment)),
        {
          key: `autoplug:pending:${p.postId}`,
          kind: "autoplug",
          postId: p.postId,
          postSnippet: p.postSnippet,
          state: "pending",
          statusLabel: "Starts when the post publishes",
          liveId: null,
          pending: p,
          handle: null,
          runs: 0,
          failedRuns: 0,
          lastRunAt: null,
          lastRunStatus: null,
          nextRunAt: null,
          scheduledAt: p.scheduledAt,
          canResume: false,
        },
      );
    }
    if (p.autoRepost) {
      addInstance(
        repostRule(
          p.autoRepost.intervalHours,
          p.autoRepost.maxResurfaces,
          normComment(p.autoRepost.plugComment),
        ),
        {
          key: `repost:pending:${p.postId}`,
          kind: "repost",
          postId: p.postId,
          postSnippet: p.postSnippet,
          state: "pending",
          statusLabel: "Starts when the post publishes",
          liveId: null,
          pending: p,
          handle: null,
          runs: 0,
          failedRuns: 0,
          lastRunAt: null,
          lastRunStatus: null,
          nextRunAt: null,
          scheduledAt: p.scheduledAt,
          canResume: false,
        },
      );
    }
  }

  const stateOrder: Record<InstanceState, number> = {
    failed: 0,
    active: 1,
    pending: 2,
    paused: 3,
    done: 4,
  };
  const list = [...rules.values()];
  for (const rule of list) {
    rule.instances.sort((a, b) => stateOrder[a.state] - stateOrder[b.state]);
  }
  return list.sort((a, b) => {
    if (a.on !== b.on) return a.on ? -1 : 1;
    const at = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
    const bt = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
    if (at !== bt) return bt - at;
    return b.instances.length - a.instances.length;
  });
}

/** "4 hours", "1 day", "30 minutes", "1.5 hours". */
export function formatInterval(hours: number): string {
  if (hours < 1) {
    const m = Math.round(hours * 60);
    return `${m} minute${m === 1 ? "" : "s"}`;
  }
  if (hours >= 24 && hours % 24 === 0) {
    const d = hours / 24;
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  const h = Number.isInteger(hours) ? hours : Number(hours.toFixed(1));
  return `${h} hour${h === 1 ? "" : "s"}`;
}

/** "likes" | "reposts" (X renamed retweets). */
export function metricWord(metricType: string | undefined, n: number): string {
  if (metricType === "retweets") return n === 1 ? "repost" : "reposts";
  return n === 1 ? "like" : "likes";
}

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export const RULE_KIND_LABEL: Record<RuleKind, string> = {
  autoplug: "Auto-Plug",
  repost: "Auto-Repost",
};

/** Tooltip form: "Tue 4 Mar 2026, 09:00". */
export function absoluteTime(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return format(d, "EEE d MMM yyyy, HH:mm");
}
