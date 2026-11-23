import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  ErrorState,
  InlineError,
  SkeletonRows,
  useSearchParamState,
} from "@/components/app";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOCS_API_WEBHOOKS_URL } from "@/lib/docs-url";
import {
  AGENTS_QUERY_KEYS,
  createWebhook,
  fetchWebhooks,
  type WebhookRow,
} from "./agents-api";
import { CodeField, ExternalTextLink } from "./agents-ui";
import { relativeTime } from "@/lib/date-format";
import { fullTime } from "./agents-format";
import { WebhookDrawer } from "./WebhookDrawer";
import { DeliveryStatusPill, EventCheckboxes, EventChips } from "./webhook-parts";

const MAX_WEBHOOKS = 20;
const DEFAULT_EVENTS = ["post.published", "post.failed"];

/** Webhooks tab: endpoints table → detail drawer with the delivery log. */
export function WebhooksTab() {
  const query = useQuery({ queryKey: AGENTS_QUERY_KEYS.webhooks, queryFn: fetchWebhooks });
  const [selectedId, setSelectedId] = useSearchParamState<string>("webhook", "");
  const [addOpen, setAddOpen] = useState(false);
  const [created, setCreated] = useState<{ id: string; secret: string } | null>(null);

  const webhooks = query.data ?? [];
  const selected = webhooks.find((w) => w.id === selectedId) ?? null;
  const atLimit = webhooks.length >= MAX_WEBHOOKS;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 max-w-2xl text-[13px] text-text-muted">
          A signed POST to your server when posts publish, fail, get scheduled or are deleted.{" "}
          <ExternalTextLink href={DOCS_API_WEBHOOKS_URL} className="text-[13px]">
            Webhook docs
          </ExternalTextLink>
        </p>
        {query.isSuccess ? (
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={atLimit}
            title={atLimit ? `You can have up to ${MAX_WEBHOOKS} endpoints. Delete one first.` : undefined}
          >
            <Plus aria-hidden />
            Add endpoint
          </Button>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="rounded-xl border border-border bg-bg-elevated">
          <SkeletonRows rows={3} />
        </div>
      ) : query.isError ? (
        <ErrorState
          message="Couldn't load your webhooks."
          detail={query.error instanceof Error ? query.error.message : null}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : webhooks.length === 0 ? (
        <EmptyState
          compact
          title="No endpoints yet."
          description="Add one to hear about publishes and failures without polling the API."
        />
      ) : (
        <>
          <DataTable aria-label="Webhook endpoints">
            <DataTableHeader>
              <tr>
                <DataTableHead>Endpoint</DataTableHead>
                <DataTableHead className="hidden md:table-cell">Events</DataTableHead>
                <DataTableHead className="hidden sm:table-cell">Status</DataTableHead>
                <DataTableHead>Last delivery</DataTableHead>
              </tr>
            </DataTableHeader>
            <DataTableBody>
              {webhooks.map((wh) => (
                <WebhookTableRow
                  key={wh.id}
                  webhook={wh}
                  onOpen={() => setSelectedId(wh.id, { push: true })}
                />
              ))}
            </DataTableBody>
          </DataTable>
          <p className="text-xs text-text-muted">
            {webhooks.length} of {MAX_WEBHOOKS} endpoints
          </p>
        </>
      )}

      <AddWebhookDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(result) => setCreated(result)}
      />
      <SecretDialog
        created={created}
        onClose={() => setCreated(null)}
        onOpenEndpoint={(id) => {
          setCreated(null);
          setSelectedId(id, { push: true });
        }}
      />
      <WebhookDrawer
        webhook={selected}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onDeleted={() => setSelectedId(null)}
      />
    </div>
  );
}

function WebhookTableRow({ webhook, onOpen }: { webhook: WebhookRow; onOpen: () => void }) {
  return (
    <DataTableRow
      onActivate={onOpen}
      tone={webhook.active ? "default" : "muted"}
      title="Open deliveries and settings"
    >
      <DataTableCell className="max-w-[18rem] sm:max-w-[22rem]">
        <div className="truncate font-mono text-xs text-text" title={webhook.url}>
          {webhook.url}
        </div>
        <div className="mt-1 text-xs text-text-muted md:hidden">
          {webhook.events.length} event{webhook.events.length === 1 ? "" : "s"}
          <span className="sm:hidden"> · {webhook.active ? "Active" : "Paused"}</span>
        </div>
      </DataTableCell>
      <DataTableCell className="hidden md:table-cell">
        <EventChips events={webhook.events} max={2} />
      </DataTableCell>
      <DataTableCell className="hidden sm:table-cell">
        {/* Active is the normal state: muted. Paused reads in full text. */}
        <span className={webhook.active ? "text-[13px] text-text-muted" : "text-[13px] font-medium text-text"}>
          {webhook.active ? "Active" : "Paused"}
        </span>
      </DataTableCell>
      <DataTableCell>
        {webhook.lastDeliveryAt && webhook.lastDeliveryStatus ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <DeliveryStatusPill
              status={webhook.lastDeliveryStatus}
              code={webhook.lastDeliveryResponseStatus}
            />
            <span
              className="whitespace-nowrap text-xs text-text-muted"
              title={fullTime(webhook.lastDeliveryAt)}
            >
              {relativeTime(webhook.lastDeliveryAt, { fallback: "Never" })}
            </span>
          </div>
        ) : (
          <span className="text-xs text-text-muted">None yet</span>
        )}
        {webhook.lastDeliveryStatus && webhook.lastDeliveryStatus !== "delivered" && webhook.lastDeliveryError ? (
          <div className="mt-1 max-w-[18rem] truncate text-xs text-danger" title={webhook.lastDeliveryError}>
            {webhook.lastDeliveryError}
          </div>
        ) : null}
      </DataTableCell>
    </DataTableRow>
  );
}

// ── Add endpoint ────────────────────────────────────────────────────────────

function validateUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Enter the URL Social0 should POST to.";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "That isn't a valid URL. It should look like https://example.com/webhooks/social0.";
  }
  if (url.protocol !== "https:") return "Use an https:// URL.";
  return null;
}

function AddWebhookDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: { id: string; secret: string }) => void;
}) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(DEFAULT_EVENTS);
  const [touched, setTouched] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setUrl("");
      setEvents(DEFAULT_EVENTS);
      setTouched(false);
    }
  }
  const urlId = useId();
  const errorId = useId();

  const mutation = useMutation({
    mutationFn: () => createWebhook({ url: url.trim(), events }),
    onSuccess: async (data) => {
      onOpenChange(false);
      onCreated({ id: data.subscription.id, secret: data.secret });
      toast.success("Endpoint added");
      await queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEYS.webhooks });
    },
  });

  const urlError = validateUrl(url);
  const showUrlError = touched && !!urlError;
  const canSubmit = !urlError && events.length > 0 && !mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) {
          if (!next) mutation.reset();
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (canSubmit) mutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Add webhook endpoint</DialogTitle>
            <DialogDescription>
              A public https URL. Social0 signs every request so you can check it came from us.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={urlId}>Endpoint URL</Label>
            <Input
              id={urlId}
              type="url"
              inputMode="url"
              autoComplete="off"
              autoFocus
              value={url}
              placeholder="https://example.com/webhooks/social0"
              aria-invalid={showUrlError || undefined}
              aria-describedby={showUrlError ? errorId : undefined}
              onBlur={() => setTouched(true)}
              onChange={(e) => {
                setUrl(e.target.value);
                if (mutation.isError) mutation.reset();
              }}
            />
            {showUrlError ? (
              <p id={errorId} className="text-xs text-danger">
                {urlError}
              </p>
            ) : null}
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-text">Events</legend>
            <EventCheckboxes value={events} onChange={setEvents} disabled={mutation.isPending} />
            {events.length === 0 ? (
              <p className="text-xs text-danger">Pick at least one event.</p>
            ) : null}
          </fieldset>
          {mutation.isError ? (
            <InlineError
              message={
                mutation.error instanceof Error
                  ? mutation.error.message
                  : "Couldn't add the endpoint. Try again."
              }
            />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit && touched}>
              {mutation.isPending ? "Adding…" : "Add endpoint"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SecretDialog({
  created,
  onClose,
  onOpenEndpoint,
}: {
  created: { id: string; secret: string } | null;
  onClose: () => void;
  onOpenEndpoint: (id: string) => void;
}) {
  return (
    <Dialog open={!!created} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy the signing secret</DialogTitle>
          <DialogDescription>
            Use it to check the{" "}
            <code className="font-mono text-[12px] text-text">X-Social0-Signature</code> header
            (HMAC-SHA256). It's shown once. If you lose it, delete the endpoint and add it again.
          </DialogDescription>
        </DialogHeader>
        <CodeField
          value={created?.secret ?? ""}
          copyLabel="Copy secret"
          toastLabel="Webhook secret copied"
          aria-label="Webhook signing secret"
        />
        <ExternalTextLink href={DOCS_API_WEBHOOKS_URL} className="self-start">
          How to verify signatures
        </ExternalTextLink>
        <DialogFooter>
          <Button variant="outline" onClick={() => created && onOpenEndpoint(created.id)}>
            Open endpoint and send a test
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
