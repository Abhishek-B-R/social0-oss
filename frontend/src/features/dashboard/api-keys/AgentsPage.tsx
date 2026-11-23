import { useLocation } from "react-router-dom";
import {
  EmptyState,
  PageContainer,
  PageHeader,
  Tabs,
  useSearchParamState,
  useTeamId,
} from "@/components/app";
import { DOCS_API_QUICKSTART_URL } from "@/lib/docs-url";
import { AGENTS_TAB_LABELS, AGENTS_TABS, type AgentsTab as AgentsTabValue } from "@/lib/dashboard-routes";
import { signInUrl } from "@/lib/sign-in-url";
import { useIsGuest } from "@/lib/use-is-guest";
import { AgentsTab } from "./AgentsTab";
import { ApiKeysTab } from "./ApiKeysTab";
import { WebhooksTab } from "./WebhooksTab";
import { ExternalTextLink } from "./agents-ui";

/**
 * AI agents page (mock 12·A): /dashboard/agents?tab=agents|keys|webhooks.
 * The old /dashboard/api-keys route redirects to ?tab=keys.
 *
 * Keys, MCP connections and webhooks belong to the signed-in user, not the
 * workspace, so the page looks the same on personal and team routes.
 */
export function AgentsPage() {
  const [rawTab, setTab] = useSearchParamState<AgentsTabValue>("tab", "agents");
  const tab: AgentsTabValue = (AGENTS_TABS as readonly string[]).includes(rawTab)
    ? rawTab
    : "agents";
  const isGuest = useIsGuest();
  const teamId = useTeamId();
  const location = useLocation();
  const signInHref = signInUrl(`${location.pathname}${location.search}`);

  return (
    <PageContainer className="pb-12">
      <PageHeader
        title="AI agents"
        actions={<ExternalTextLink href={DOCS_API_QUICKSTART_URL}>API quickstart</ExternalTextLink>}
      >
        <Tabs<AgentsTabValue>
          aria-label="AI agents sections"
          idBase="agents"
          value={tab}
          onChange={(next) => {
            // Drop sub-state that belongs to another tab (?client=, ?webhook=).
            setTab(next, { reset: ["client", "webhook", "page"] });
          }}
          items={AGENTS_TABS.map((t) => ({ value: t, label: AGENTS_TAB_LABELS[t] }))}
        />
      </PageHeader>

      <div role="tabpanel" id={`agents-panel-${tab}`} aria-labelledby={`agents-tab-${tab}`}>
        {teamId && !isGuest ? (
          <p className="mb-4 text-[13px] text-text-muted">
            Agents and keys belong to your account, not this team. Posts they create go to your
            personal workspace.
          </p>
        ) : null}
        {tab === "agents" ? (
          <AgentsTab isGuest={isGuest} signInHref={signInHref} />
        ) : isGuest ? (
          <EmptyState
            compact
            title={tab === "keys" ? "Sign in to manage API keys." : "Sign in to manage webhooks."}
            primaryAction={{ label: "Sign in", href: signInHref }}
          />
        ) : tab === "keys" ? (
          <ApiKeysTab />
        ) : (
          <WebhooksTab />
        )}
      </div>
    </PageContainer>
  );
}

export default AgentsPage;
