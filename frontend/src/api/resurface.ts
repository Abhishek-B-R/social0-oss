import { rpc } from "@/lib/rpc";

export type AutoPlugConfig = {
  metricType: "likes" | "retweets";
  threshold: number;
  plugComment: string;
};

export type CreateAutoPlugResult =
  | { success: true; autoPlugId: string }
  | { success: false; error: string };

export type CreateResurfaceResult =
  | { success: true; scheduleId: string }
  | { success: false; error: string };

export type DisableResurfaceResult =
  | { success: true }
  | { success: false; error: string };

export type UpdateAutoPlugResult =
  | { success: true }
  | { success: false; error: string };

export type UpdateResurfaceScheduleResult =
  | { success: true }
  | { success: false; error: string };

export async function createAutoPlug(
  postId: string,
  connectedAccountId: string | null,
  config: AutoPlugConfig,
): Promise<CreateAutoPlugResult> {
  return rpc<CreateAutoPlugResult>("resurface.createAutoPlug", postId, connectedAccountId, config);
}

export async function createResurfaceSchedule(
  postId: string,
  platform: string,
  intervalHours: number,
  maxResurfaces: number,
  plugComment: string | null,
): Promise<CreateResurfaceResult> {
  return rpc<CreateResurfaceResult>(
    "resurface.createResurfaceSchedule",
    postId,
    platform,
    intervalHours,
    maxResurfaces,
    plugComment,
  );
}

export async function disableResurfaceSchedule(
  scheduleId: string,
): Promise<DisableResurfaceResult> {
  return rpc<DisableResurfaceResult>("resurface.disableResurfaceSchedule", scheduleId);
}

export async function updateAutoPlug(
  postId: string,
  config: AutoPlugConfig,
): Promise<UpdateAutoPlugResult> {
  return rpc<UpdateAutoPlugResult>("resurface.updateAutoPlug", postId, config);
}

export async function cancelAutoPlug(postId: string): Promise<UpdateAutoPlugResult> {
  return rpc<UpdateAutoPlugResult>("resurface.cancelAutoPlug", postId);
}

export async function updateResurfaceSchedule(
  scheduleId: string,
  updates: {
    intervalHours?: number;
    maxResurfaces?: number;
    plugComment?: string | null;
    isActive?: boolean;
  },
): Promise<UpdateResurfaceScheduleResult> {
  return rpc<UpdateResurfaceScheduleResult>("resurface.updateResurfaceSchedule", scheduleId, updates);
}
