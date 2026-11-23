/* "How will you post?" choices. Setup values live in `@/lib/agent-setup`. */
export { CLI_ONE_LINER, HOSTED_MCP_URL } from "@/lib/agent-setup";

export type PostMode = "self" | "agent" | "both";

export const POST_MODES: {
  id: PostMode;
  title: string;
  description: string;
}[] = [
  {
    id: "self",
    title: "I'll write posts myself",
    description: "Open the composer, pick accounts, schedule or publish.",
  },
  {
    id: "agent",
    title: "My AI agent will post for me",
    description: "Connect ChatGPT, Claude, Cursor or a script.",
  },
  {
    id: "both",
    title: "Both",
    description: "Write some posts yourself and let your agent draft the rest.",
  },
];
