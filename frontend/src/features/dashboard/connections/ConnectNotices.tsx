import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Link from "@/components/AppLink";
import { Banner, networkLabel } from "@/components/app";
import { connectErrorMessage, isNetworkId, type NetworkId } from "./accounts-model";

const RESULT_PARAMS = ["error", "platform", "message", "connected", "success", "reauth"];

/**
 * What the OAuth round trip says when it lands back here:
 * `?connected=` / `?success=` (account-picker pages) / `?reauth=success`
 * → toast, `?reauth=warning` and `?error=` → a banner with the fix. Params
 * are cleared once read so a reload doesn't replay them.
 */
export function ConnectNotices({
  canAccessBilling,
  billingHref,
  onRetry,
}: {
  canAccessBilling: boolean;
  billingHref: string;
  /** Called when "Try again" reopens the connect flow (via `?connect=`). */
  onRetry?: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const error = params.get("error");
  const platform = params.get("platform");
  const message = params.get("message");
  const connected = params.get("connected") ?? params.get("success");
  const reauth = params.get("reauth");

  const clear = (keys: string[] = RESULT_PARAMS) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const k of keys) p.delete(k);
        return p;
      },
      { replace: true },
    );

  // Success: toast once, then drop the params. (Toast ids dedupe StrictMode replays.)
  useEffect(() => {
    if (!connected && reauth !== "success") return;
    if (reauth === "success") {
      toast.success("Account reconnected.", { id: "accounts-reauth-success" });
    } else if (connected) {
      const name = isNetworkId(connected) ? networkLabel(connected) : connected;
      toast.success(`Connected ${name}.`, { id: `accounts-connected-${connected}` });
    }
    const keys =
      reauth === "warning" ? ["connected", "success"] : ["connected", "success", "reauth"];
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const k of keys) p.delete(k);
        return p;
      },
      { replace: true },
    );
  }, [connected, reauth, setParams]);

  const network = isNetworkId(platform) ? platform : null;

  return (
    <>
      {reauth === "warning" ? (
        <Banner
          tier="blocking"
          title="That was a different account."
          onDismiss={() => clear(["reauth"])}
        >
          You signed in with another account than the one you were reconnecting,
          so it was added as a new account. Reconnect the original one while
          signed in to it.
        </Banner>
      ) : null}
      {error ? (
        <ErrorBanner
          code={error}
          network={network}
          serverMessage={message}
          canAccessBilling={canAccessBilling}
          billingHref={billingHref}
          onDismiss={() => clear()}
          onRetry={() => {
            // Clear the error and open the connect modal in one URL update.
            setParams(
              (prev) => {
                const p = new URLSearchParams(prev);
                for (const k of RESULT_PARAMS) p.delete(k);
                p.set("connect", network ?? "1");
                return p;
              },
              { replace: true },
            );
            onRetry?.();
          }}
        />
      ) : null}
    </>
  );
}

function ErrorBanner({
  code,
  network,
  serverMessage,
  canAccessBilling,
  billingHref,
  onDismiss,
  onRetry,
}: {
  code: string;
  network: NetworkId | null;
  serverMessage: string | null;
  canAccessBilling: boolean;
  billingHref: string;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const { title, fix } = connectErrorMessage(
    code,
    network ? networkLabel(network) : null,
    serverMessage,
  );
  const isLimit = code === "limit" || code === "limit_reached";
  return (
    <Banner
      tier="danger"
      title={title}
      onDismiss={onDismiss}
      actions={
        isLimit ? (
          canAccessBilling ? (
            <Button asChild size="sm">
              <Link href={billingHref}>Upgrade</Link>
            </Button>
          ) : undefined
        ) : (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {isLimit && !canAccessBilling ? "Ask the workspace owner to upgrade the plan." : fix}
    </Banner>
  );
}
