import { useState, type FormEvent } from "react";
import Link from "@/components/AppLink";
import { Button } from "@/components/ui/button";
import { CheckCircle, CircleNotch } from "@/icons/phosphor";
import { cn } from "@/lib/utils";
import { SkeletonBone } from "@/components/ui/skeleton-bone";

function PickerHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <>
      <h1 className="mb-2 dash-page-title">
        {title}
      </h1>
      {subtitle ? (
        <p className="text-sm leading-snug text-text-muted">{subtitle}</p>
      ) : null}
    </>
  );
}

export type AccountPickerAccount = {
  id: string;
  name: string;
  pictureUrl: string | null;
};

type AccountPickerProps = {
  accounts: AccountPickerAccount[];
  title: string;
  subtitle?: string;
  submitLabel?: string;
  cancelHref?: string;
  onSelect: (id: string) => void;
  loading?: boolean;
  error?: string | null;
};

export function AccountPickerSkeleton({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <PickerHeader title={title} subtitle={subtitle} />
      <div className="mt-8 space-y-2">
        <SkeletonBone className="h-[4.25rem] w-full rounded-xl" />
        <SkeletonBone className="h-[4.25rem] w-full rounded-xl" />
      </div>
    </div>
  );
}

export function AccountPickerEmpty({
  title,
  message,
  cancelHref,
  cancelLabel = "Back to connections",
}: {
  title: string;
  message: string;
  cancelHref: string;
  cancelLabel?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <PickerHeader title={title} subtitle={message} />
      <Button asChild variant="outline" className="mt-6">
        <Link href={cancelHref}>{cancelLabel}</Link>
      </Button>
    </div>
  );
}

export function AccountPicker({
  accounts,
  title,
  subtitle = "Pick the page you want to connect.",
  submitLabel = "Connect selected",
  cancelHref,
  onSelect,
  loading = false,
  error = null,
}: AccountPickerProps) {
  const [selectedId, setSelectedId] = useState<string>(
    () => accounts[0]?.id ?? "",
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (selectedId) onSelect(selectedId);
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <PickerHeader title={title} subtitle={subtitle} />

      <form onSubmit={handleSubmit} className="mt-8">
        <div className="space-y-2" role="radiogroup" aria-label={title}>
          {accounts.map((account) => {
            const selected = selectedId === account.id;
            return (
              <label
                key={account.id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-[background-color,border-color,transform] duration-150 ease-out focus-within:ring-2 focus-within:ring-accent/30 active:scale-[0.99]",
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-border bg-card hover:bg-muted/50",
                )}
              >
                <input
                  type="radio"
                  name="account"
                  value={account.id}
                  checked={selected}
                  onChange={() => setSelectedId(account.id)}
                  className="sr-only"
                />
                {account.pictureUrl ? (
                  <img
                    src={account.pictureUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {account.name}
                </span>
                <CheckCircle
                  size={20}
                  weight={selected ? "fill" : "regular"}
                  className={cn(
                    "shrink-0",
                    selected ? "text-accent" : "text-muted-foreground/40",
                  )}
                  aria-hidden
                />
              </label>
            );
          })}
        </div>

        {error ? (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {cancelHref ? (
            <Button asChild variant="outline">
              <Link href={cancelHref}>Cancel</Link>
            </Button>
          ) : null}
          <Button type="submit" disabled={!selectedId || loading}>
            {loading ? (
              <>
                <CircleNotch size={16} className="animate-spin" />
                Connecting
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
