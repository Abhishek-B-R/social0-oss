import { fetchApi } from "@/lib/fetch-api";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
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

type BlueskyByokModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (username: string) => void;
};

const EMPTY_FORM = { handle: "", appPassword: "" };

export function BlueskyByokModal({
  isOpen,
  onClose,
  onSuccess,
}: BlueskyByokModalProps) {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    toast.dismiss();

    try {
      const response = await fetchApi("/api/connect/bluesky/byok", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || data.error || "Failed to connect Bluesky account",
        );
      }

      // Success - close modal and refresh
      onSuccess(data.username || "user");
      onClose();
      // Reload page to show updated connection status
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange =
    (field: keyof typeof formData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Bluesky</DialogTitle>
          <DialogDescription>
            Requires your handle and an app password. Don&apos;t use your main
            password: create an app password in Bluesky under Settings, App
            passwords.
          </DialogDescription>
        </DialogHeader>
        <a
          href="https://bsky.app/settings/app-passwords"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 rounded text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          bsky.app/settings/app-passwords
          <ExternalLink className="size-3.5" aria-hidden />
        </a>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bluesky-handle">Bluesky handle</Label>
            <Input
              id="bluesky-handle"
              type="text"
              value={formData.handle}
              onChange={handleChange("handle")}
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="@username.bsky.social"
              aria-describedby="bluesky-handle-hint"
            />
            <p id="bluesky-handle-hint" className="text-xs text-text-muted">
              @username.bsky.social or username.bsky.social
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bluesky-app-password">App password</Label>
            <Input
              id="bluesky-app-password"
              type="password"
              value={formData.appPassword}
              onChange={handleChange("appPassword")}
              required
              autoComplete="off"
              placeholder="xxxx-xxxx-xxxx-xxxx"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Connecting…" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
