import { useSession } from "@/lib/auth-client";
import {
  getPostSource,
  type PostSourceInfo,
  type PostSourceOptions,
} from "./post-source";

/**
 * Source chip info for a post. Pass the post (anything with `metadata`) or
 * its metadata. Uses the signed-in user to tell "You" from a teammate.
 */
export function usePostSource(
  post:
    | { metadata?: unknown; createdByUserId?: string | null }
    | null
    | undefined,
  opts: Omit<PostSourceOptions, "currentUserId"> = {},
): PostSourceInfo {
  const { data: session } = useSession();
  return getPostSource(post?.metadata ?? null, {
    currentUserId: session?.user?.id ?? null,
    createdByUserId: post?.createdByUserId ?? opts.createdByUserId ?? null,
    teammateName: opts.teammateName,
  });
}
