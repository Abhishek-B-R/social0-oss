import {
  WORKSPACE_ICON_OPTIONS,
  normalizeWorkspaceIconId,
  type WorkspaceIconId,
} from "@/lib/workspace-icon-options";
import { cn } from "@/lib/utils";

const ICON_BY_ID = Object.fromEntries(
  WORKSPACE_ICON_OPTIONS.map((o) => [o.id, o.Icon]),
) as Record<
  WorkspaceIconId,
  (typeof WORKSPACE_ICON_OPTIONS)[number]["Icon"]
>;

export function WorkspaceIcon({
  id,
  className,
  size = 16,
}: {
  id: string | null | undefined;
  className?: string;
  size?: number;
}) {
  const Icon = ICON_BY_ID[normalizeWorkspaceIconId(id)];
  return <Icon className={cn(className)} size={size} />;
}
