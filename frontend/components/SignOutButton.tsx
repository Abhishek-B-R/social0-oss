"use client";

import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

  return (
    <button
      onClick={handleSignOut}
      className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
    >
      Sign out
    </button>
  );
}
