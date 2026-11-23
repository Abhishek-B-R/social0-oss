import { useNavigate } from "react-router-dom";
import Link from "@/components/AppLink";
import { ErrorState } from "@/components/app/states";
import { PageContainer } from "@/components/app";
import { PickerHeader } from "@/components/AccountPicker";

/**
 * Shown by the OAuth account-select pages when the account list can't be
 * loaded (missing/expired sign-in token, network or server error). Distinct
 * from AccountPickerEmpty, which is only for a successful, empty response.
 *
 * With a token, Retry refetches. Without one there is nothing to retry, so
 * Retry restarts the connect flow instead.
 */
export function SelectLoadError({
  title,
  message,
  detail,
  hasToken,
  onRetry,
  retrying = false,
  startOverHref,
}: {
  title: string;
  message: string;
  detail?: string | null;
  hasToken: boolean;
  onRetry: () => void;
  retrying?: boolean;
  /** Reopens this network's connect flow, e.g. `dash("connections?connect=facebook")`. */
  startOverHref: string;
}) {
  const navigate = useNavigate();
  return (
    <PageContainer>
      <PickerHeader title={title} />
      <div className="max-w-xl">
      <ErrorState
        message={message}
        detail={detail}
        onRetry={hasToken ? onRetry : () => navigate(startOverHref)}
        retrying={retrying}
      />
      {hasToken ? (
        <p className="mt-4 text-center text-sm text-text-muted">
          Still not working?{" "}
          <Link
            href={startOverHref}
            className="font-medium text-text underline underline-offset-2 hover:no-underline"
          >
            Start over
          </Link>
        </p>
      ) : null}
      </div>
    </PageContainer>
  );
}
