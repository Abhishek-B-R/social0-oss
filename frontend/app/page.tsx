"use client";

import { signIn } from "@/lib/auth-client";

export default function Home() {
  const handleSignUp = () => {
    signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full mx-4 text-center">
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
          Schedule posts across your social networks in one place
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
          Connect all your social media accounts and manage your content from a
          single dashboard.
        </p>
        <button
          onClick={handleSignUp}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg shadow-lg transition-colors duration-200"
        >
          Get started
        </button>
      </div>
    </div>
  );
}