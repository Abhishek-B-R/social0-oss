import { useState, type MouseEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  ErrorState,
  RowActions,
  SkeletonRows,
  Tabs,
  useSearchParamState,
} from "@/components/app";
import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { AgentConnection } from "@/api/dashboard";
import { listWorkspaces, switchWorkspace } from "@/api/team";
import {
  isTeamAppPath,
  isTeamSettingsPath,
  writePersonalWorkspaceId,
} from "@/lib/dashboard-base-path";
import { WORKSPACES_QUERY_KEY } from "@/lib/team-query-keys";
import { clearTeamBootstrap } from "@/layouts/team-bootstrap";
import {
  DOCS_API_OPENAPI_URL,
  DOCS_API_QUICKSTART_URL,
  DOCS_CLI_QUICKSTART_URL,
  DOCS_CLI_URL,
  DOCS_MCP_QUICKSTART_URL,
  DOCS_MCP_URL,
} from "@/lib/docs-url";
import { cn } from "@/lib/utils";
import { AGENTS_QUERY_KEYS, fetchAgentConnections } from "./agents-api";
import {
  AGENT_CLIENTS,
  CLI_LOCAL_COMMANDS,
  CLI_REMOTE_COMMANDS,
  claudeCodeMcpCommand,
  curlWhoAmI,
  EXAMPLE_PROMPT,
  HOSTED_MCP_URL,
  stdioMcpJson,
  type AgentClient,
} from "./agents-setup";
import { CodeField, CopyButton, ExternalTextLink, Pill, Step } from "./agents-ui";
import { relativeTime } from "@/lib/date-format";
import { fullTime, latestIso, shortDate } from "./agents-format";
import {
  CreateKeyDialog,
  RevealKeyDialog,
  RevokeKeyDialog,
  type RevealedKey,
} from "./KeyDialogs";

/** Agents tab: per-client setup guide + connected agents. */
export function AgentsTab({
  isGuest = false,
  signInHref,
}: {
  isGuest?: boolean;
  signInHref: string;
}) {
  const navigate = useNavigate();
  const [client, setClient] = useSearchParamState<AgentClient>("client", "chatgpt");
  const activeClient = AGENT_CLIENTS.some((c) => c.value === client) ? client : "chatgpt";
  const [createOpen, setCreateOpen] = useState(false);
  const [revealed, setRevealed] = useState<RevealedKey | null>(null);
  const onCreateKey = isGuest ? () => navigate(signInHref) : () => setCreateOpen(true);

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="agents-setup-title"
        className="rounded-xl border border-border bg-bg-elevated"
      >
        <h2 id="agents-setup-title" className="px-4 pt-4 text-sm font-semibold text-text sm:px-5">
          Connect an agent
        </h2>
        <div className="px-4 pt-3 sm:px-5">
          <Tabs<AgentClient>
            aria-label="Agent client"
            variant="pill"
            idBase="agent-client"
            value={activeClient}
            onChange={(v) => setClient(v)}
            items={AGENT_CLIENTS}
            className="w-full sm:w-auto"
          />
        </div>
        <div
          role="tabpanel"
          id={`agent-client-panel-${activeClient}`}
          aria-labelledby={`agent-client-tab-${activeClient}`}
          className="px-4 pb-5 pt-4 sm:px-5"
        >
          <ClientGuide client={activeClient} onCreateKey={onCreateKey} />
        </div>
      </section>

      {isGuest ? (
        <EmptyState
          compact
          title="Sign in to see your connected agents."
          primaryAction={{ label: "Sign in", href: signInHref }}
        />
      ) : (
        <ConnectedAgents onCreateKey={onCreateKey} />
      )}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={setRevealed}
        defaultName={
          activeClient === "cursor"
            ? "Cursor"
            : activeClient === "claude-code"
              ? "Claude Code"
              : ""
        }
      />
      <RevealKeyDialog revealed={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}

// ── Setup guides ────────────────────────────────────────────────────────────

function GuideLayout({
  steps,
  aside,
  footer,
}: {
  steps: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "grid gap-5",
          aside ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" : undefined,
        )}
      >
        <ol className="list-decimal space-y-2 pl-5 marker:text-text-muted">{steps}</ol>
        {aside ? <div className="min-w-0 space-y-3">{aside}</div> : null}
      </div>
      {footer ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-text-muted">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

function Prompt() {
  return <span className="text-text-muted">{EXAMPLE_PROMPT}</span>;
}

function CreateKeyStep({ onCreateKey }: { onCreateKey: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onCreateKey}
        className="font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
      >
        Create an API key
      </button>{" "}
      and copy it. You'll only see it once.
    </>
  );
}

function RemoteMcpAside({ openHref, openLabel }: { openHref: string; openLabel: string }) {
  return (
    <>
      <CodeField value={HOSTED_MCP_URL} copyLabel="Copy URL" toastLabel="MCP URL copied" aria-label="MCP server URL" />
      <div className="flex flex-wrap items-center gap-3">
        <ExternalTextLink href={openHref}>{openLabel}</ExternalTextLink>
      </div>
      <p className="text-xs text-text-muted">
        Sign in with Social0 when asked. Don't put an API key in the URL. Signing in creates an{" "}
        <span className="font-medium text-text">MCP Connector</span> key you can revoke below.
      </p>
    </>
  );
}

function ClientGuide({
  client,
  onCreateKey,
}: {
  client: AgentClient;
  onCreateKey: () => void;
}) {
  const [cliMode, setCliMode] = useState<"local" | "remote">("local");

  switch (client) {
    case "chatgpt":
      return (
        <GuideLayout
          steps={
            <>
              <Step>In ChatGPT, open Settings › Connectors and add a custom connector.</Step>
              <Step>Paste the URL and sign in to Social0.</Step>
              <Step>
                Ask: <Prompt />
              </Step>
            </>
          }
          aside={<RemoteMcpAside openHref="https://chatgpt.com/#settings/Connectors" openLabel="Open ChatGPT connectors" />}
          footer={<ExternalTextLink href={DOCS_MCP_QUICKSTART_URL} className="text-xs">MCP quickstart</ExternalTextLink>}
        />
      );
    case "claude":
      return (
        <GuideLayout
          steps={
            <>
              <Step>In Claude, open Settings › Connectors and add a custom connector.</Step>
              <Step>Paste the URL and sign in to Social0.</Step>
              <Step>
                Ask: <Prompt />
              </Step>
            </>
          }
          aside={<RemoteMcpAside openHref="https://claude.ai/settings/connectors" openLabel="Open Claude connectors" />}
          footer={<ExternalTextLink href={DOCS_MCP_QUICKSTART_URL} className="text-xs">MCP quickstart</ExternalTextLink>}
        />
      );
    case "cursor":
      return (
        <GuideLayout
          steps={
            <>
              <Step>
                <CreateKeyStep onCreateKey={onCreateKey} />
              </Step>
              <Step>
                In Cursor, open Settings › MCP › Add new server, or edit{" "}
                <code className="font-mono text-[12px]">~/.cursor/mcp.json</code>. Paste this and
                replace <code className="font-mono text-[12px]">sk_live_...</code> with your key.
              </Step>
              <Step>
                Ask in Agent mode: <Prompt />
              </Step>
            </>
          }
          aside={
            <CodeField
              value={stdioMcpJson()}
              multiline
              copyLabel="Copy"
              toastLabel="Config copied"
              aria-label="Cursor MCP config"
            />
          }
          footer={
            <>
              <ExternalTextLink href={DOCS_MCP_QUICKSTART_URL} className="text-xs">MCP quickstart</ExternalTextLink>
              <ExternalTextLink href={DOCS_MCP_URL} className="text-xs">MCP docs</ExternalTextLink>
            </>
          }
        />
      );
    case "claude-code": {
      const commands = cliMode === "local" ? CLI_LOCAL_COMMANDS : CLI_REMOTE_COMMANDS;
      return (
        <div className="space-y-6">
          <GuideLayout
            steps={
              <>
                <Step>
                  <CreateKeyStep onCreateKey={onCreateKey} />
                </Step>
                <Step>
                  Run this in your terminal, with your key in place of{" "}
                  <code className="font-mono text-[12px]">sk_live_...</code>.
                </Step>
                <Step>
                  Ask Claude Code: <Prompt />
                </Step>
              </>
            }
            aside={
              <CodeField
                value={claudeCodeMcpCommand()}
                copyLabel="Copy"
                toastLabel="Command copied"
                aria-label="Claude Code MCP command"
              />
            }
          />
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-text">Or use the Social0 CLI + skill</h3>
                <p className="mt-0.5 text-sm text-text-muted">
                  From your terminal, CI or any coding agent: read data and queue posts.
                </p>
              </div>
              <Tabs<"local" | "remote">
                aria-label="Where the CLI runs"
                variant="pill"
                value={cliMode}
                onChange={setCliMode}
                items={[
                  { value: "local", label: "Locally" },
                  { value: "remote", label: "CI & remote" },
                ]}
              />
            </div>
            <div className="space-y-2">
              {commands.map((command) => (
                <CodeField key={command} value={command} toastLabel="Command copied" />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
            <ExternalTextLink href={DOCS_MCP_QUICKSTART_URL} className="text-xs">MCP quickstart</ExternalTextLink>
            <ExternalTextLink href={DOCS_CLI_QUICKSTART_URL} className="text-xs">CLI quickstart</ExternalTextLink>
            <ExternalTextLink href={DOCS_CLI_URL} className="text-xs">CLI docs</ExternalTextLink>
          </div>
        </div>
      );
    }
    case "api":
      return (
        <GuideLayout
          steps={
            <>
              <Step>
                <CreateKeyStep onCreateKey={onCreateKey} />
              </Step>
              <Step>
                Send it as a Bearer token to the REST API. Your posts go through the same
                pipeline as the dashboard.
              </Step>
              <Step>
                Add a webhook to hear when posts publish or fail.
              </Step>
            </>
          }
          aside={
            <>
              <CodeField
                value={curlWhoAmI()}
                multiline
                copyLabel="Copy"
                toastLabel="Command copied"
                aria-label="Example API request"
              />
              <p className="text-xs text-text-muted">
                Any other MCP client that supports remote servers can use{" "}
                <code className="font-mono text-[12px] text-text">{HOSTED_MCP_URL}</code>{" "}
                <CopyButton
                  text={HOSTED_MCP_URL}
                  label="Copy URL"
                  toastLabel="MCP URL copied"
                  variant="secondary"
                  className="ml-1 h-7 align-middle"
                />
              </p>
            </>
          }
          footer={
            <>
              <ExternalTextLink href={DOCS_API_QUICKSTART_URL} className="text-xs">API quickstart</ExternalTextLink>
              <ExternalTextLink href={DOCS_API_OPENAPI_URL} className="text-xs">OpenAPI reference</ExternalTextLink>
              <ExternalTextLink href={DOCS_MCP_URL} className="text-xs">MCP docs</ExternalTextLink>
            </>
          }
        />
      );
  }
}

// ── Connected agents ────────────────────────────────────────────────────────

function agentLabel(c: AgentConnection): string {
  if (c.kind === "mcp_connector") return c.clientName ?? "MCP host";
  return c.name;
}

/** How the agent connects, as plain text: violet for MCP, muted key prefix otherwise. */
function Via({ c }: { c: AgentConnection }) {
  if (c.kind === "mcp_connector") {
    return <span className="whitespace-nowrap text-[13px] text-agent">MCP · OAuth</span>;
  }
  return (
    <span
      className="whitespace-nowrap font-mono text-xs text-text-muted"
      title={`API key ${c.keyPrefix}…`}
    >
      {c.keyPrefix}…
    </span>
  );
}

/** API keys always act on the personal Main pool (`workspaceId: null`). */
const AGENT_DRAFTS_HREF = "/dashboard/posts?tab=review";

/**
 * Link to the personal "Needs review" tab where agent drafts land. From a team
 * page, or while a team workspace is active (PersonalWorkspaceBoot would
 * bounce /dashboard/posts into that team), switch to Main first.
 */
function AgentDraftsLink({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [switching, setSwitching] = useState(false);
  const { data } = useQuery({ queryKey: WORKSPACES_QUERY_KEY, queryFn: listWorkspaces });
  const activeId = data?.workspaces.find((w) => w.isActive)?.id ?? null;
  const onTeamTree = isTeamAppPath(pathname) || isTeamSettingsPath(pathname);
  const needsSwitch = onTeamTree || activeId !== null;

  const onClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!needsSwitch) return;
    // Let modified clicks open a new tab untouched.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (switching) return;
    setSwitching(true);
    try {
      await switchWorkspace(null);
      writePersonalWorkspaceId(null);
      clearTeamBootstrap();
      // Full navigation, same as the workspace switcher: a soft one lets the
      // team layout fight the switch.
      window.location.assign(AGENT_DRAFTS_HREF);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't switch workspace. Try again.");
      setSwitching(false);
    }
  };

  return (
    <Link
      href={AGENT_DRAFTS_HREF}
      onClick={(e) => void onClick(e)}
      aria-busy={switching || undefined}
      className="font-medium text-text underline underline-offset-2 hover:no-underline"
    >
      {children}
    </Link>
  );
}

function ConnectedAgents({ onCreateKey }: { onCreateKey: () => void }) {
  const [revokeTarget, setRevokeTarget] = useState<AgentConnection | null>(null);
  const query = useQuery({
    queryKey: AGENTS_QUERY_KEYS.connections,
    queryFn: fetchAgentConnections,
  });

  const connections = query.data?.connections ?? [];

  return (
    <section aria-labelledby="connected-agents-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="connected-agents-title" className="text-sm font-semibold text-text">
          Connected agents
        </h2>
        {connections.length > 0 ? (
          <Button size="sm" variant="outline" onClick={onCreateKey}>
            <Plus aria-hidden />
            New API key
          </Button>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="rounded-xl border border-border bg-bg-elevated">
          <SkeletonRows rows={3} />
        </div>
      ) : query.isError ? (
        <ErrorState
          compact
          message="Couldn't load your connected agents."
          detail={query.error instanceof Error ? query.error.message : null}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : connections.length === 0 ? (
        <EmptyState
          compact
          title="No agents connected yet."
          description="Follow the steps above and it shows up here."
          primaryAction={{ label: "Create API key", onClick: onCreateKey }}
        />
      ) : (
        <DataTable aria-label="Connected agents">
          <DataTableHeader>
            <tr>
              <DataTableHead>Agent</DataTableHead>
              <DataTableHead className="hidden sm:table-cell">Via</DataTableHead>
              <DataTableHead className="text-right">Posts</DataTableHead>
              <DataTableHead className="hidden md:table-cell">Last active</DataTableHead>
              <DataTableHead className="w-0">
                <span className="sr-only">Actions</span>
              </DataTableHead>
            </tr>
          </DataTableHeader>
          <DataTableBody>
            {connections.map((c) => {
              const lastActive = latestIso(c.lastUsedAt, c.lastPostAt);
              return (
                <DataTableRow key={c.keyId} tone={c.expired ? "muted" : "default"}>
                  <DataTableCell className="max-w-[16rem]">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-text">{agentLabel(c)}</span>
                      {c.expired ? <Pill tone="warning">Expired</Pill> : null}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-text-muted">
                      {c.kind === "mcp_connector"
                        ? `Connected ${shortDate(c.createdAt)}`
                        : `Created ${shortDate(c.createdAt)}`}
                      <span className="sm:hidden"> · {relativeTime(lastActive, { fallback: "never used" })}</span>
                    </div>
                    <div className="mt-0.5 sm:hidden">
                      <Via c={c} />
                    </div>
                  </DataTableCell>
                  <DataTableCell className="hidden sm:table-cell">
                    <Via c={c} />
                  </DataTableCell>
                  <DataTableCell className="text-right tabular-nums">
                    {c.postsCreated > 0 ? (
                      <span title={c.lastPostAt ? `Last post ${fullTime(c.lastPostAt)}` : undefined}>
                        {c.postsCreated.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-text-muted">0</span>
                    )}
                  </DataTableCell>
                  <DataTableCell className="hidden whitespace-nowrap text-text-muted md:table-cell">
                    <span title={lastActive ? fullTime(lastActive) : undefined}>
                      {relativeTime(lastActive, { fallback: "Not yet" })}
                    </span>
                  </DataTableCell>
                  <DataTableCell className="text-right">
                    {/* Expired rows keep the action in view: removing them is the fix. */}
                    <RowActions visible={c.expired}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger hover:bg-danger-soft hover:text-danger"
                        onClick={() => setRevokeTarget(c)}
                      >
                        {c.kind === "mcp_connector" ? "Disconnect" : "Revoke"}
                      </Button>
                    </RowActions>
                  </DataTableCell>
                </DataTableRow>
              );
            })}
          </DataTableBody>
        </DataTable>
      )}

      <p className="text-[13px] text-text-muted">
        Drafts your agents create land in{" "}
        <AgentDraftsLink>Needs review</AgentDraftsLink>{" "}
        for you to approve. Agents post to your personal workspace.
      </p>

      <RevokeKeyDialog
        target={
          revokeTarget
            ? {
                id: revokeTarget.keyId,
                name: revokeTarget.name,
                isMcpConnector: revokeTarget.kind === "mcp_connector",
                agentLabel: agentLabel(revokeTarget),
              }
            : null
        }
        onClose={() => setRevokeTarget(null)}
      />
    </section>
  );
}
