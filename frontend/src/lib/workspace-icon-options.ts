import {
  Briefcase,
  Buildings,
  Camera,
  ChartLine,
  Code,
  House,
  Megaphone,
  Palette,
  Rocket,
  Users,
} from "@/icons/phosphor";

export const WORKSPACE_ICON_OPTIONS = [
  { id: "briefcase", label: "Work", Icon: Briefcase },
  { id: "house", label: "Personal", Icon: House },
  { id: "buildings", label: "Company", Icon: Buildings },
  { id: "users", label: "Clients", Icon: Users },
  { id: "megaphone", label: "Marketing", Icon: Megaphone },
  { id: "palette", label: "Creative", Icon: Palette },
  { id: "code", label: "Product", Icon: Code },
  { id: "camera", label: "Media", Icon: Camera },
  { id: "chart-line", label: "Growth", Icon: ChartLine },
  { id: "rocket", label: "Launch", Icon: Rocket },
] as const;

export type WorkspaceIconId = (typeof WORKSPACE_ICON_OPTIONS)[number]["id"];

export function normalizeWorkspaceIconId(
  raw: string | null | undefined,
): WorkspaceIconId {
  if (raw && WORKSPACE_ICON_OPTIONS.some((o) => o.id === raw)) {
    return raw as WorkspaceIconId;
  }
  return "briefcase";
}
