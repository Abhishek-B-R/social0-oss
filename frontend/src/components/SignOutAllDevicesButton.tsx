
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function SignOutAllDevicesButton({ className }: { className?: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { error } = await authClient.revokeSessions();
      if (error) {
        toast.error(error.message ?? "Could not sign out all devices.");
        setLoading(false);
        return;
      }
      await authClient.signOut();
      window.location.href = "/";
    } catch {
      toast.error("Could not sign out all devices.");
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={loading}
      className={cn(
        "rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 dark:bg-accent dark:hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {loading ? "Signing out…" : "Sign Out All Devices"}
    </button>
  );
}
