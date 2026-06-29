"use client";

import Link from "@/components/AppLink";
import { usePathname } from "@/lib/router";
import { signInUrl } from "@/lib/sign-in-url";

type GuestSignInPromptProps = {
  title: string;
  description: string;
};

export function GuestSignInPrompt({
  title,
  description,
}: GuestSignInPromptProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-bg-muted/30 px-6 py-16 text-center">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-text-muted">{description}</p>
      <Link
        href={signInUrl(pathname)}
        className="mt-6 inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
      >
        Sign in
      </Link>
    </div>
  );
}
