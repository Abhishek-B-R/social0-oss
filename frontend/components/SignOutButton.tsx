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
      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      Sign out
    </button>
  );
}
