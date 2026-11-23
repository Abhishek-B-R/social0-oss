import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
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
} from "@/components/app";
import { Button } from "@/components/ui/button";
import { DOCS_API_URL } from "@/lib/docs-url";
import { planName } from "@/lib/plan-name";
import { AGENTS_QUERY_KEYS, fetchApiKeys, type ApiKeyRow } from "./agents-api";
import { MCP_CONNECTOR_KEY_NAMES } from "./agents-setup";
import { ExternalTextLink, Pill, RowMenu } from "./agents-ui";
import { relativeTime } from "@/lib/date-format";
import { fullTime, maskedKey, shortDate } from "./agents-format";
import {
  CreateKeyDialog,
  RegenerateKeyDialog,
  RenameKeyDialog,
  RevealKeyDialog,
  RevokeKeyDialog,
  type RevealedKey,
} from "./KeyDialogs";

const MAX_ACTIVE_KEYS = 25;

function isConnectorKey(name: string): boolean {
  return MCP_CONNECTOR_KEY_NAMES.includes(name);
}

function isExpired(key: ApiKeyRow): boolean {
  return !!key.expiresAt && new Date(key.expiresAt).getTime() < Date.now();
}

/** API keys tab: table + create / reveal-once / rename / regenerate / revoke. */
export function ApiKeysTab() {
  const keysQuery = useQuery({ queryKey: AGENTS_QUERY_KEYS.keys, queryFn: fetchApiKeys });
  const [createOpen, setCreateOpen] = useState(false);
  const [revealed, setRevealed] = useState<RevealedKey | null>(null);
  const [renameTarget, setRenameTarget] = useState<ApiKeyRow | null>(null);
  const [regenTarget, setRegenTarget] = useState<ApiKeyRow | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);

  const keys = keysQuery.data?.keys ?? [];
  const budget = keysQuery.data?.rateLimit ?? null;
  const atLimit = keys.length >= MAX_ACTIVE_KEYS;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 max-w-2xl text-[13px] text-text-muted">
          Keep keys on servers, never in browser code.
          {budget
            ? ` ${planName(budget.tier)} allows ${budget.requestsPerHour.toLocaleString()} requests an hour.`
            : null}{" "}
          <ExternalTextLink href={DOCS_API_URL} className="text-[13px]">
            API docs
          </ExternalTextLink>
        </p>
        {keysQuery.isSuccess ? (
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={atLimit}
            title={atLimit ? `You can have up to ${MAX_ACTIVE_KEYS} keys. Revoke one first.` : undefined}
          >
            <Plus aria-hidden />
            Create API key
          </Button>
        ) : null}
      </div>

      {keysQuery.isLoading ? (
        <div className="rounded-xl border border-border bg-bg-elevated">
          <SkeletonRows rows={3} />
        </div>
      ) : keysQuery.isError ? (
        <ErrorState
          message="Couldn't load your API keys."
          detail={keysQuery.error instanceof Error ? keysQuery.error.message : null}
          onRetry={() => void keysQuery.refetch()}
          retrying={keysQuery.isFetching}
        />
      ) : keys.length === 0 ? (
        <EmptyState
          compact
          title="No API keys yet."
          description="Create one to use the API, the CLI or a local MCP server."
        />
      ) : (
        <>
          <DataTable aria-label="API keys">
            <DataTableHeader>
              <tr>
                <DataTableHead>Name</DataTableHead>
                <DataTableHead className="hidden sm:table-cell">Key</DataTableHead>
                <DataTableHead className="hidden md:table-cell">Created</DataTableHead>
                <DataTableHead className="hidden sm:table-cell">Last used</DataTableHead>
                <DataTableHead className="hidden lg:table-cell">Expires</DataTableHead>
                <DataTableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </DataTableHead>
              </tr>
            </DataTableHeader>
            <DataTableBody>
              {keys.map((key) => {
                const expired = isExpired(key);
                const connector = isConnectorKey(key.name);
                return (
                  <DataTableRow key={key.id} tone={expired ? "muted" : "default"}>
                    <DataTableCell className="max-w-[14rem]">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-text" title={key.name}>
                          {key.name}
                        </span>
                        {connector ? <span className="shrink-0 text-xs text-agent">MCP</span> : null}
                        {expired ? <Pill tone="warning">Expired</Pill> : null}
                      </div>
                      {/* Columns hidden on phones fold in here. */}
                      <div className="mt-0.5 space-y-0.5 text-xs text-text-muted sm:hidden">
                        <div className="font-mono">{maskedKey(key.keyPrefix)}</div>
                        <div>
                          Last used {relativeTime(key.lastUsedAt, { fallback: "never" })} · Created{" "}
                          {shortDate(key.createdAt)}
                        </div>
                      </div>
                    </DataTableCell>
                    <DataTableCell className="hidden whitespace-nowrap font-mono text-xs text-text-muted sm:table-cell">
                      {maskedKey(key.keyPrefix)}
                    </DataTableCell>
                    <DataTableCell className="hidden whitespace-nowrap text-text-muted md:table-cell">
                      <span title={fullTime(key.createdAt)}>{shortDate(key.createdAt)}</span>
                    </DataTableCell>
                    <DataTableCell className="hidden whitespace-nowrap text-text-muted sm:table-cell">
                      <span title={key.lastUsedAt ? fullTime(key.lastUsedAt) : undefined}>
                        {relativeTime(key.lastUsedAt, { fallback: "Never" })}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="hidden whitespace-nowrap text-text-muted lg:table-cell">
                      {key.expiresAt ? (
                        <span
                          className={expired ? "text-warning" : undefined}
                          title={fullTime(key.expiresAt)}
                        >
                          {shortDate(key.expiresAt)}
                        </span>
                      ) : (
                        "Never"
                      )}
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      <RowActions
                        visible={expired}
                        // Keep the ⋯ trigger in view while its menu is open.
                        className="has-[[aria-expanded=true]]:opacity-100"
                      >
                        <RowMenu
                          label={`Actions for ${key.name}`}
                          items={[
                            // The MCP connector key is rotated by the OAuth
                            // connector itself and identified by its name, so
                            // it can be neither renamed nor regenerated.
                            ...(connector
                              ? []
                              : [
                                  {
                                    label: "Rename",
                                    icon: <Pencil />,
                                    onSelect: () => setRenameTarget(key),
                                  },
                                  {
                                    label: "Regenerate",
                                    icon: <RefreshCw />,
                                    onSelect: () => setRegenTarget(key),
                                  },
                                ]),
                            {
                              label: connector ? "Disconnect MCP host" : "Revoke",
                              icon: <Trash2 />,
                              tone: "danger",
                              onSelect: () => setRevokeTarget(key),
                            },
                          ]}
                        />
                      </RowActions>
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
          </DataTable>
          <p className="text-xs text-text-muted">
            {keys.length} of {MAX_ACTIVE_KEYS} keys
            {atLimit ? " · Revoke a key to create another." : null}
          </p>
        </>
      )}

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setRevealed} />
      <RevealKeyDialog revealed={revealed} onClose={() => setRevealed(null)} />
      <RenameKeyDialog target={renameTarget} onClose={() => setRenameTarget(null)} />
      <RegenerateKeyDialog
        target={regenTarget}
        onClose={() => setRegenTarget(null)}
        onRegenerated={setRevealed}
      />
      <RevokeKeyDialog
        target={
          revokeTarget
            ? {
                id: revokeTarget.id,
                name: revokeTarget.name,
                isMcpConnector: isConnectorKey(revokeTarget.name),
              }
            : null
        }
        onClose={() => setRevokeTarget(null)}
      />
    </div>
  );
}
