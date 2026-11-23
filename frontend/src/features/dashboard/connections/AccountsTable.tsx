import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/date-format";
import Link from "@/components/AppLink";
import { AccountAvatar } from "@/components/AccountAvatar";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  NetworkIcon,
  RowActions,
  Skeleton,
  networkLabel,
} from "@/components/app";
import { cn } from "@/lib/utils";
import {
  NETWORK_ACCOUNT_TYPES,
  accountQualifier,
  accountTitle,
  pinterestDefaultBoardId,
  type AccountRow,
  type NetworkId,
} from "./accounts-model";

type AccountsTableProps = {
  rows: AccountRow[];
  /** Networks with no account, shown as faded "Connect" rows. */
  unconnected: NetworkId[];
  loading: boolean;
  metadata: Record<string, Record<string, unknown>> | undefined;
  canManage: boolean;
  canAccessBilling: boolean;
  billingHref: string;
  showAddedBy: boolean;
  showLastPost: boolean;
  onOpen: (account: AccountRow) => void;
  onConnect: (network: NetworkId) => void;
};

/**
 * Health table: one row per account, broken first; unconnected networks at the
 * bottom. Healthy accounts carry no status: the Status column only appears
 * while some account needs a fix, and then names the problem.
 */
export function AccountsTable({
  rows,
  unconnected,
  loading,
  metadata,
  canManage,
  canAccessBilling,
  billingHref,
  showAddedBy,
  showLastPost,
  onOpen,
  onConnect,
}: AccountsTableProps) {
  const showStatus = !loading && rows.some((a) => a.health !== "healthy");
  return (
    <DataTable aria-label="Connected accounts" tableClassName="min-w-[320px]">
      <DataTableHeader>
        <tr>
          <DataTableHead>Account</DataTableHead>
          {showStatus ? (
            <DataTableHead className="hidden sm:table-cell">Status</DataTableHead>
          ) : null}
          {showAddedBy ? (
            <DataTableHead className="hidden md:table-cell">Added by</DataTableHead>
          ) : null}
          {showLastPost ? (
            <DataTableHead className="hidden md:table-cell">Last post</DataTableHead>
          ) : null}
          <DataTableHead className="w-px text-right">
            <span className="sr-only">Actions</span>
          </DataTableHead>
        </tr>
      </DataTableHeader>
      <DataTableBody>
        {loading
          ? Array.from({ length: 4 }, (_, i) => (
              <tr key={`sk-${i}`} className="border-b border-border last:border-b-0">
                <DataTableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                </DataTableCell>
                {showAddedBy ? (
                  <DataTableCell className="hidden md:table-cell">
                    <Skeleton className="h-3.5 w-14" />
                  </DataTableCell>
                ) : null}
                {showLastPost ? (
                  <DataTableCell className="hidden md:table-cell">
                    <Skeleton className="h-3.5 w-14" />
                  </DataTableCell>
                ) : null}
                <DataTableCell>
                  <Skeleton className="ml-auto h-8 w-8 rounded-lg" />
                </DataTableCell>
              </tr>
            ))
          : rows.map((a) => (
              <AccountTableRow
                key={a.id}
                account={a}
                meta={metadata?.[a.id]}
                canManage={canManage}
                canAccessBilling={canAccessBilling}
                billingHref={billingHref}
                showStatus={showStatus}
                showAddedBy={showAddedBy}
                showLastPost={showLastPost}
                onOpen={onOpen}
              />
            ))}
        {!loading
          ? unconnected.map((id) => (
              <DataTableRow
                key={`net-${id}`}
                className="text-text-muted"
                onActivate={canManage ? () => onConnect(id) : undefined}
              >
                <DataTableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border opacity-70">
                      <NetworkIcon network={id} size={16} label="" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-text-muted">{networkLabel(id)}</p>
                      <p className="text-xs text-text-subtle">{NETWORK_ACCOUNT_TYPES[id]}</p>
                    </div>
                    {showStatus ? null : <span className="sr-only">Not connected</span>}
                  </div>
                </DataTableCell>
                {showStatus ? (
                  <DataTableCell className="hidden text-[13px] sm:table-cell">
                    Not connected
                  </DataTableCell>
                ) : null}
                {showAddedBy ? <DataTableCell className="hidden md:table-cell" /> : null}
                {showLastPost ? <DataTableCell className="hidden md:table-cell" /> : null}
                <DataTableCell className="text-right">
                  {canManage ? (
                    <RowActions>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onConnect(id)}
                        aria-label={`Connect ${networkLabel(id)}`}
                      >
                        <Plus aria-hidden />
                        Connect
                      </Button>
                    </RowActions>
                  ) : null}
                </DataTableCell>
              </DataTableRow>
            ))
          : null}
      </DataTableBody>
    </DataTable>
  );
}

function AccountTableRow({
  account: a,
  meta,
  canManage,
  canAccessBilling,
  billingHref,
  showStatus,
  showAddedBy,
  showLastPost,
  onOpen,
}: {
  account: AccountRow;
  meta: Record<string, unknown> | undefined;
  canManage: boolean;
  canAccessBilling: boolean;
  billingHref: string;
  showStatus: boolean;
  showAddedBy: boolean;
  showLastPost: boolean;
  onOpen: (account: AccountRow) => void;
}) {
  const title = accountTitle(a);
  const qualifier = accountQualifier(a, meta);
  const needsBoard =
    canManage &&
    a.platform === "pinterest" &&
    a.health === "healthy" &&
    meta !== undefined &&
    !pinterestDefaultBoardId(meta);
  // Paused rows fade; an expired row is marked by its status text and its
  // always-visible Reconnect, not a tinted background.
  const tone = a.health === "inactive" ? "muted" : "default";
  const problem = a.health !== "healthy";
  const hasFix =
    canManage && (a.health === "expired" || (a.health === "inactive" && canAccessBilling));

  return (
    <DataTableRow tone={tone} onActivate={() => onOpen(a)}>
      {/* `w-full max-w-0` lets the cell shrink so long handles truncate
          instead of pushing the table (and its row menu) off a phone. */}
      <DataTableCell className="w-full max-w-0">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <AccountAvatar
              profileImageUrl={a.profileImageUrl}
              username={a.platformUsername}
              platform={a.platform}
              size="sm"
            />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-bg-elevated p-px">
              <NetworkIcon network={a.platform} size={12} label="" />
            </span>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1 truncate text-sm font-medium text-text">
              <span className="truncate">{title}</span>
              {a.platform === "twitter_x" && a.isTwitterPremium ? (
                <img src="/icons/twitter-premium.svg" alt="X Premium" className="size-3 shrink-0" />
              ) : null}
            </p>
            <p className="truncate text-xs text-text-muted">
              {[
                title !== a.handle ? a.handle : null,
                networkLabel(a.platform),
                qualifier,
              ]
                .filter(Boolean)
                .join(" · ")}
              {needsBoard ? (
                <>
                  {" · "}
                  <span className="text-warning">Choose a default board</span>
                </>
              ) : null}
            </p>
            {problem ? <HealthStatus account={a} className="mt-0.5 block sm:hidden" /> : null}
          </div>
        </div>
      </DataTableCell>
      {showStatus ? (
        <DataTableCell className="hidden sm:table-cell">
          <HealthStatus account={a} />
        </DataTableCell>
      ) : null}
      {showAddedBy ? (
        <DataTableCell className="hidden text-sm text-text-muted md:table-cell">
          {a.addedByName ?? "-"}
        </DataTableCell>
      ) : null}
      {showLastPost ? (
        <DataTableCell className="hidden whitespace-nowrap text-sm text-text-muted md:table-cell">
          {relativeTime(a.lastPostAt, { fallback: "Never" })}
        </DataTableCell>
      ) : null}
      <DataTableCell className="text-right">
        <RowActions visible={hasFix}>
          {canManage && a.health === "expired" ? (
            <Button asChild size="sm" variant="ghost" className="text-accent hover:text-accent">
              <a href={a.reconnectHref} aria-label={`Reconnect ${title} on ${networkLabel(a.platform)}`}>
                Reconnect
              </a>
            </Button>
          ) : null}
          {canManage && a.health === "inactive" && canAccessBilling ? (
            <Button asChild size="sm" variant="ghost" className="text-accent hover:text-accent">
              <Link href={billingHref}>Upgrade</Link>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpen(a)}
            aria-label={`Settings for ${title} on ${networkLabel(a.platform)}`}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </RowActions>
      </DataTableCell>
    </DataTableRow>
  );
}

/** Problem text for an account; nothing at all when it's working. */
function HealthStatus({ account, className }: { account: AccountRow; className?: string }) {
  if (account.health === "expired") {
    return <span className={cn("text-[13px] font-medium text-warning", className)}>Sign-in expired</span>;
  }
  if (account.health === "inactive") {
    return <span className={cn("text-[13px] text-text-muted", className)}>Over plan limit</span>;
  }
  return null;
}
