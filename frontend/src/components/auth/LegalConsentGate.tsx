import { fetchApi } from "@/lib/fetch-api";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EMPTY_LEGAL_CONSENT,
  LegalConsentCheckboxes,
  type LegalConsentValues,
} from "@/components/auth/LegalConsentCheckboxes";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-errors";

type LegalStatusResponse = {
  needsAcceptance: boolean;
};

export function LegalConsentGate() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [consent, setConsent] =
    useState<LegalConsentValues>(EMPTY_LEGAL_CONSENT);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi("/api/legal/status", { credentials: "include" });
      if (res.status === 401) {
        setOpen(false);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as LegalStatusResponse;
      setOpen(data.needsAcceptance);
      if (data.needsAcceptance) {
        setConsent(EMPTY_LEGAL_CONSENT);
      }
    } catch {
      // ponytail: silent fail - user can retry on next navigation
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const handleAccept = async () => {
    if (!consent.acceptTerms || !consent.acceptPrivacy) {
      toast.error(
        "Please accept the Terms of Service and acknowledge the Privacy Policy.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchApi("/api/legal/accept", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(consent),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Could not save your preferences.");
        return;
      }
      setOpen(false);
      toast.success("Thanks - you're all set.");
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Review our updated policies</DialogTitle>
          <DialogDescription>
            We&apos;ve updated how we collect consent. Please review and accept
            our Terms of Service and Privacy Policy to continue using Social0.
          </DialogDescription>
        </DialogHeader>
        <LegalConsentCheckboxes
          idPrefix="gate"
          values={consent}
          onChange={setConsent}
        />
        <button
          type="button"
          onClick={handleAccept}
          disabled={
            submitting || !consent.acceptTerms || !consent.acceptPrivacy
          }
          className="w-full rounded-[10px] bg-accent py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
