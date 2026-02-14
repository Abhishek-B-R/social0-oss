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
      className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
    >
      Sign out
    </button>
  );
}
