import { useId, useState, type ReactNode } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  EmptyState,
  ErrorState,
  SkeletonRows,
  Toggle,
} from "@/components/app";
import { updateWebhookSubscription } from "@/api/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AGENTS_QUERY_KEYS,
  deleteWebhook,
  fetchWebhookDeliveries,
  sendWebhookTest,
  WEBHOOK_DELIVERIES_PAGE_SIZE,
  type WebhookDelivery,
  type WebhookRow,
  type WebhookTestOutcome,
} from "./agents-api";
import { ConfirmDialog, CopyButton } from "./agents-ui";
import { relativeTime } from "@/lib/date-format";
import { eventLabel, fullTime } from "./agents-format";
import { DeliveryStatusPill, EventCheckboxes } from "./webhook-parts";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Endpoint detail: settings on top, delivery log (list + detail) below. */
export function WebhookDrawer({
  webhook,
  open,
  onOpenChange,
  onDeleted,
}: {
  webhook: WebhookRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="xl"
      title={webhook ? hostOf(webhook.url) : "Webhook"}
      description={webhook ? <span className="break-all font-mono text-xs">{webhook.url}</span> : null}
    >
      {/* Keyed so per-endpoint state (test result, selection) resets. */}
      {webhook ? <WebhookDetail key={webhook.id} webhook={webhook} onDeleted={onDeleted} /> : null}
    </Drawer>
  );
}

function Section({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

function WebhookDetail({
  webhook,
  onDeleted,
}: {
  webhook: WebhookRow;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEYS.webhooks });

  // ── Pause / resume (optimistic) ──
  const [pendingActive, setPendingActive] = useState<boolean | null>(null);
  const activeMutation = useMutation({
    mutationFn: (active: boolean) => updateWebhookSubscription(webhook.id, { active }),
    onMutate: (active) => setPendingActive(active),
    onSuccess: async (_d, active) => {
      toast.success(active ? "Endpoint resumed" : "Endpoint paused");
      await invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't update this endpoint. Try again.")),
    onSettled: () => setPendingActive(null),
  });
  const active = pendingActive ?? webhook.active;

  // ── Events (autosave per change, revert on failure) ──
  const [pendingEvents, setPendingEvents] = useState<string[] | null>(null);
  const eventsMutation = useMutation({
    mutationFn: (events: string[]) => updateWebhookSubscription(webhook.id, { events }),
    onMutate: (events) => setPendingEvents(events),
    onSuccess: async () => {
      toast.success("Events saved");
      await invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't save events. Try again.")),
    onSettled: () => setPendingEvents(null),
  });
  const events = pendingEvents ?? webhook.events;

  // ── URL ──
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(webhook.url);
  const urlInputId = useId();
  const urlMutation = useMutation({
    mutationFn: (url: string) => updateWebhookSubscription(webhook.id, { url }),
    onSuccess: async () => {
      toast.success("URL updated");
      setEditingUrl(false);
      await invalidate();
    },
  });

  // ── Test ──
  const [testResult, setTestResult] = useState<WebhookTestOutcome | null>(null);
  const testMutation = useMutation({
    mutationFn: () => sendWebhookTest(webhook.id),
    onMutate: () => setTestResult(null),
    onSuccess: async (outcome) => {
      setTestResult(outcome);
      if (outcome.status === "delivered") {
        toast.success(
          `Endpoint answered HTTP ${outcome.responseStatus ?? "2xx"} in ${outcome.durationMs} ms`,
        );
      } else {
        toast.error(outcome.error ?? "The endpoint didn't accept the test.");
      }
      await invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't send the test. Try again.")),
  });

  // ── Delete ──
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => deleteWebhook(webhook.id),
    onSuccess: async () => {
      toast.success("Endpoint deleted");
      setConfirmDelete(false);
      onDeleted();
      await invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't delete the endpoint. Try again.")),
  });

  return (
    <div className="space-y-6">
      {/* Status + test */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <Toggle
          checked={active}
          onCheckedChange={(next) => activeMutation.mutate(next)}
          pending={activeMutation.isPending}
          disabled={activeMutation.isPending}
          label={active ? "Receiving events" : "Paused"}
          description={
            active
              ? "Pause to stop deliveries without deleting the endpoint."
              : "No events are sent while paused. Missed events aren't sent later."
          }
          className="min-w-0 flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
        >
          <Send aria-hidden />
          {testMutation.isPending ? "Sending…" : "Send test"}
        </Button>
      </div>

      {testResult ? <TestResult outcome={testResult} /> : null}

      {/* URL */}
      <Section title="Endpoint URL">
        {editingUrl ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const next = urlDraft.trim();
              if (!next || next === webhook.url) {
                setEditingUrl(false);
                return;
              }
              urlMutation.mutate(next);
            }}
          >
            <label htmlFor={urlInputId} className="sr-only">
              Endpoint URL
            </label>
            <Input
              id={urlInputId}
              type="url"
              inputMode="url"
              autoFocus
              value={urlDraft}
              onChange={(e) => {
                setUrlDraft(e.target.value);
                if (urlMutation.isError) urlMutation.reset();
              }}
              aria-invalid={urlMutation.isError || undefined}
              className="font-mono text-xs"
            />
            {urlMutation.isError ? (
              <p role="alert" className="text-xs text-danger">
                {errorMessage(urlMutation.error, "Couldn't update the URL. Try again.")}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={urlMutation.isPending || !urlDraft.trim()}>
                {urlMutation.isPending ? "Saving…" : "Save URL"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={urlMutation.isPending}
                onClick={() => {
                  setUrlDraft(webhook.url);
                  urlMutation.reset();
                  setEditingUrl(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-bg-subtle px-3 py-2 font-mono text-xs text-text">
              {webhook.url}
            </code>
            <CopyButton text={webhook.url} toastLabel="URL copied" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setUrlDraft(webhook.url);
                setEditingUrl(true);
              }}
            >
              Edit
            </Button>
          </div>
        )}
      </Section>

      {/* Events */}
      <Section
        title="Events"
        actions={
          eventsMutation.isPending ? (
            <span className="text-xs text-text-muted" aria-live="polite">
              Saving…
            </span>
          ) : null
        }
      >
        <EventCheckboxes
          value={events}
          lockLast
          disabled={eventsMutation.isPending}
          onChange={(next) => {
            if (next.length > 0) eventsMutation.mutate(next);
          }}
        />
      </Section>

      <DeliveryLog webhookId={webhook.id} />

      <Section title="Signing secret">
        <p className="text-sm text-text-muted">
          The secret was shown once, when you added this endpoint. If you've lost it, delete the
          endpoint and add it again to get a new one.
        </p>
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">Delete endpoint</p>
          <p className="text-sm text-text-muted">Stops all deliveries and removes its log.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-danger-border text-danger hover:bg-danger-soft hover:text-danger"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 aria-hidden />
          Delete
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this endpoint?"
        description={
          <p>
            <span className="break-all font-mono text-xs text-text">{webhook.url}</span> stops
            getting events right away. This can't be undone.
          </p>
        }
        confirmLabel="Delete endpoint"
        pendingLabel="Deleting…"
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}

function TestResult({ outcome }: { outcome: WebhookTestOutcome }) {
  const ok = outcome.status === "delivered";
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg px-3 py-2.5 text-sm",
        ok ? "bg-ok-soft" : "bg-danger-soft",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <DeliveryStatusPill status={outcome.status} code={outcome.responseStatus} />
        <span className="text-text">
          {ok
            ? `Test delivered in ${outcome.durationMs} ms.`
            : outcome.status === "blocked"
              ? "Test blocked: the URL points at a private or local address."
              : `Test failed after ${outcome.attempts} attempt${outcome.attempts === 1 ? "" : "s"}.`}
        </span>
      </div>
      {!ok && outcome.error ? (
        <p className="mt-1.5 break-words text-xs text-danger">{outcome.error}</p>
      ) : null}
    </div>
  );
}

// ── Delivery log ────────────────────────────────────────────────────────────

function DeliveryLog({ webhookId }: { webhookId: string }) {
  const query = useInfiniteQuery({
    queryKey: AGENTS_QUERY_KEYS.deliveries(webhookId),
    queryFn: ({ pageParam }) => fetchWebhookDeliveries(webhookId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => {
      if (last.length < WEBHOOK_DELIVERIES_PAGE_SIZE) return undefined;
      const tail = last.at(-1);
      return tail?.cursor ?? tail?.createdAt ?? undefined;
    },
  });
  const deliveries = query.data?.pages.flat() ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = deliveries.find((d) => d.id === selectedId) ?? deliveries[0] ?? null;
  const delivered = deliveries.filter((d) => d.status === "delivered").length;

  const refreshing = query.isRefetching && !query.isFetchingNextPage;

  return (
    <Section
      title="Deliveries"
      actions={
        <div className="flex items-center gap-3">
          {deliveries.length > 0 ? (
            <span className="text-xs text-text-muted">
              {delivered} of {deliveries.length} delivered
            </span>
          ) : null}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            aria-label="Refresh deliveries"
          >
            <RefreshCw
              className={cn(refreshing && "animate-spin motion-reduce:animate-none")}
              aria-hidden
            />
            Refresh
          </Button>
        </div>
      }
    >
      {query.isLoading ? (
        <div className="rounded-xl border border-border">
          <SkeletonRows rows={4} />
        </div>
      ) : query.isError && deliveries.length === 0 ? (
        <ErrorState
          compact
          message="Couldn't load deliveries."
          detail={errorMessage(query.error, "")}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : deliveries.length === 0 ? (
        <EmptyState
          compact
          title="No deliveries yet."
          description="They show up here after the next matching event, or send a test now."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-border md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <ul
              aria-label="Deliveries"
              className="max-h-[26rem] divide-y divide-border overflow-y-auto overscroll-contain md:border-r md:border-border"
            >
              {deliveries.map((d) => {
                const isSelected = selected?.id === d.id;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      aria-current={isSelected || undefined}
                      onClick={() => setSelectedId(d.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40",
                        isSelected ? "bg-bg-muted" : "hover:bg-bg-subtle",
                      )}
                    >
                      <DeliveryStatusPill status={d.status} code={d.responseStatus} />
                      <span className="min-w-0 flex-1 truncate text-sm text-text">
                        {eventLabel(d.event)}
                      </span>
                      <span
                        className="shrink-0 whitespace-nowrap text-xs text-text-muted"
                        title={fullTime(d.createdAt)}
                      >
                        {relativeTime(d.createdAt, { fallback: "Never" })}
                      </span>
                    </button>
                    {/* Phones: detail opens under the row. */}
                    {selectedId === d.id ? (
                      <div className="border-t border-border bg-bg-subtle md:hidden">
                        <DeliveryDetail delivery={d} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="hidden min-w-0 bg-bg-subtle md:block">
              {selected ? <DeliveryDetail delivery={selected} /> : null}
            </div>
          </div>
          {query.hasNextPage || query.isFetchNextPageError ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? "Loading…" : "Load older"}
              </Button>
              {query.isFetchNextPageError ? (
                <span role="alert" className="text-xs text-danger">
                  Couldn't load older deliveries. Try again.
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 py-1.5 text-sm">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-text">{children}</dd>
    </div>
  );
}

function statusExplainer(d: WebhookDelivery): string {
  if (d.status === "delivered") return "Your endpoint answered with a 2xx.";
  if (d.status === "blocked") {
    return "Not sent: the URL (or a redirect) pointed at a private or local address.";
  }
  return "Social0 retries on 5xx, 408, 425, 429 and network errors, up to 3 attempts. Other 4xx answers stop right away.";
}

function DeliveryDetail({ delivery: d }: { delivery: WebhookDelivery }) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <DeliveryStatusPill status={d.status} code={d.responseStatus} />
        <span className="text-sm font-medium text-text">{eventLabel(d.event)}</span>
      </div>
      <p className="text-xs text-text-muted">{statusExplainer(d)}</p>
      <dl className="divide-y divide-border">
        <DetailRow label="Sent">{fullTime(d.createdAt)}</DetailRow>
        <DetailRow label="Event">
          <code className="font-mono text-xs">{d.event}</code>
        </DetailRow>
        <DetailRow label="HTTP status">
          {d.responseStatus != null ? (
            <code className="font-mono text-xs">{d.responseStatus}</code>
          ) : (
            <span className="text-text-muted">No response</span>
          )}
        </DetailRow>
        <DetailRow label="Attempts">{d.attempts}</DetailRow>
        <DetailRow label="Duration">
          {d.durationMs != null ? `${d.durationMs.toLocaleString()} ms` : "—"}
        </DetailRow>
        <DetailRow label="URL">
          <code className="break-all font-mono text-xs">{d.url}</code>
        </DetailRow>
        <DetailRow label="Delivery ID">
          <span className="flex items-center gap-2" title="Sent as the X-Social0-Delivery-Id header">
            <code className="min-w-0 truncate font-mono text-xs" title={d.deliveryId}>
              {d.deliveryId}
            </code>
            <CopyButton
              text={d.deliveryId}
              label="Copy"
              toastLabel="Delivery ID copied"
              variant="secondary"
              className="h-7"
            />
          </span>
        </DetailRow>
        {d.error ? (
          <DetailRow label="Error">
            <span className="text-danger">{d.error}</span>
          </DetailRow>
        ) : null}
      </dl>
      <p className="text-xs text-text-muted">
        Payloads and response bodies aren't stored, so past deliveries can't be replayed. Use
        Send test to check the endpoint now.
      </p>
    </div>
  );
}
