import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listAutomations, type AutomationPending } from "@/api/dashboard";
import {
  cancelAutoPlug,
  disableResurfaceSchedule,
  updateResurfaceSchedule,
} from "@/api/resurface";
import { updateScheduledPostAutoFeatures } from "@/api/posts";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import { useDashboardBasePath } from "@/components/app";
import { useSession } from "@/lib/auth-client";
import { buildRules, type AutomationRule, type RuleInstance } from "./automation-rules";

export const AUTOMATIONS_QUERY_KEY = ["automations"] as const;

type Result = { success: true } | { success: false; error: string };

function pendingPlug(p: AutomationPending | null): AutoPlugConfig | null {
  if (!p?.autoPlug) return null;
  return {
    metricType: p.autoPlug.metricType === "retweets" ? "retweets" : "likes",
    threshold: p.autoPlug.threshold,
    plugComment: p.autoPlug.plugComment,
  };
}

function pendingRepost(p: AutomationPending | null): AutoResurfaceConfig | null {
  if (!p?.autoRepost) return null;
  return {
    intervalHours: p.autoRepost.intervalHours,
    maxResurfaces: p.autoRepost.maxResurfaces,
    plugComment: p.autoRepost.plugComment ?? "",
  };
}

/** Turn one post's automation off, using the mutation that fits its state. */
async function turnOff(inst: RuleInstance): Promise<Result> {
  if (inst.state === "pending") {
    // Keep the other feature on that scheduled post as it is.
    return updateScheduledPostAutoFeatures(inst.postId, {
      autoPlugConfig: inst.kind === "autoplug" ? null : pendingPlug(inst.pending),
      resurfaceConfig: inst.kind === "repost" ? null : pendingRepost(inst.pending),
    });
  }
  if (inst.state !== "active") return { success: true };
  if (inst.kind === "autoplug") return cancelAutoPlug(inst.postId);
  if (!inst.liveId) return { success: false, error: "Schedule not found" };
  return disableResurfaceSchedule(inst.liveId);
}

async function turnOn(inst: RuleInstance): Promise<Result> {
  if (!inst.canResume || inst.kind !== "repost" || !inst.liveId) {
    return { success: true };
  }
  return updateResurfaceSchedule(inst.liveId, { isActive: true });
}

/**
 * Automations list + on/off mutations. Mutations run one at a time (`busyKey`)
 * because two writes to the same scheduled post would overwrite each other's
 * metadata.
 */
export function useAutomations() {
  const { data: session } = useSession();
  const base = useDashboardBasePath();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => [...AUTOMATIONS_QUERY_KEY, base], [base]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await listAutomations();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: !!session,
    staleTime: 30_000,
  });

  const rules = useMemo<AutomationRule[]>(
    () => (query.data ? buildRules(query.data) : []),
    [query.data],
  );

  const [busyKey, setBusyKey] = useState<string | null>(null);

  const run = useCallback(
    async (
      key: string,
      targets: RuleInstance[],
      fn: (inst: RuleInstance) => Promise<Result>,
      messages: { done: string; failed: string },
    ) => {
      if (busyKey || targets.length === 0) return false;
      setBusyKey(key);
      const errors: string[] = [];
      try {
        // Sequential on purpose: see the hook comment.
        for (const inst of targets) {
          try {
            const res = await fn(inst);
            if (!res.success) errors.push(res.error);
          } catch (e) {
            errors.push(e instanceof Error ? e.message : "Request failed");
          }
        }
      } finally {
        await queryClient.invalidateQueries({ queryKey: AUTOMATIONS_QUERY_KEY });
        setBusyKey(null);
      }
      if (errors.length === 0) {
        toast.success(messages.done);
        return true;
      }
      const ok = targets.length - errors.length;
      toast.error(
        ok > 0
          ? `${messages.failed} on ${errors.length} of ${targets.length} posts: ${errors[0]}`
          : `${messages.failed}: ${errors[0]}`,
      );
      return false;
    },
    [busyKey, queryClient],
  );

  const setRuleOn = useCallback(
    (rule: AutomationRule, on: boolean) => {
      const targets = on
        ? rule.instances.filter((i) => i.canResume)
        : rule.instances.filter((i) => i.state === "active" || i.state === "pending");
      return run(rule.key, targets, on ? turnOn : turnOff, {
        done: on ? "Automation turned on" : "Automation turned off",
        failed: on ? "Couldn't turn it on" : "Couldn't turn it off",
      });
    },
    [run],
  );

  const setInstanceOn = useCallback(
    (inst: RuleInstance, on: boolean) =>
      run(inst.key, [inst], on ? turnOn : turnOff, {
        done: on ? "Turned on for this post" : "Turned off for this post",
        failed: on ? "Couldn't turn it on" : "Couldn't turn it off",
      }),
    [run],
  );

  return {
    query,
    data: query.data ?? null,
    rules,
    busyKey,
    setRuleOn,
    setInstanceOn,
  };
}
