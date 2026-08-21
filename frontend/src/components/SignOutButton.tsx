
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { resetVemetricUser } from "@/lib/vemetric";

export function SignOutButton({ className }: { className?: string }) {
  const handleSignOut = async () => {
    await resetVemetricUser();
    await signOut();
    window.location.href = "/";
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className={cn(
        "w-full rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors",
        className,
      )}
    >
      Sign out
    </button>
  );
}
