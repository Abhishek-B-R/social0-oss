import { getClient } from "./client.js";

export interface Workspace {
  id: string;
  name: string;
  team_id: string;
  team_name: string;
  role: "owner" | "admin" | "member" | "community" | "analyst";
  active: boolean;
  permissions: string[];
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const response = await getClient().get<{ data: Workspace[] }>("/workspaces");
  return response.data;
}
