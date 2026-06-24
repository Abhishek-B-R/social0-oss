import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccounts } from "@/hooks/use-publish";
import { connectionsService } from "@/services/connections.service";
import { accountsService } from "@/services/accounts.service";
import { PLATFORMS, platformLabel, type Platform } from "@/lib/platforms";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ConnectionsPage() {
  const { data: accounts = [], isLoading, error } = useAccounts();
  const queryClient = useQueryClient();

  const disconnect = useMutation({
    mutationFn: (id: string) => accountsService.disconnect(id),
    onSuccess: () => {
      toast.success("Account disconnected");
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-text-muted">Loading connections…</p>;
  if (error) return <p className="text-destructive">{(error as Error).message}</p>;

  const connectedPlatforms = new Set(accounts.map((a) => a.platform));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Connections</h1>
        <p className="text-text-muted">Connect your social accounts to publish.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-muted">Connected</h2>
        {accounts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-text-muted">
            No accounts connected yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-bg-elevated">
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{platformLabel(account.platform)}</p>
                  <p className="text-sm text-text-muted">
                    @{account.platformUsername ?? account.platformUserId}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnect.mutate(account.id)}
                  disabled={disconnect.isPending}
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-text-muted">Add platform</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {PLATFORMS.map((p) => (
            <PlatformConnectButton
              key={p.id}
              platform={p.id}
              connected={connectedPlatforms.has(p.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function PlatformConnectButton({
  platform,
  connected,
}: {
  platform: Platform;
  connected: boolean;
}) {
  if (platform === "bluesky") {
    return (
      <Button variant="outline" className="justify-start" disabled={connected}>
        Bluesky (BYOK modal — wire in step 2)
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      className="justify-start"
      asChild
      disabled={connected}
    >
      <a href={connectionsService.connectUrl(platform)}>
        {connected ? `${platformLabel(platform)} connected` : `Connect ${platformLabel(platform)}`}
      </a>
    </Button>
  );
}
