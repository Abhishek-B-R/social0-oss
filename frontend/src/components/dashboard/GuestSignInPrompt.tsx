import { useLocation } from "react-router-dom";
import { EmptyState } from "@/components/app";
import { signInUrl } from "@/lib/sign-in-url";

type GuestSignInPromptProps = {
  title: string;
  description: string;
};

export function GuestSignInPrompt({
  title,
  description,
}: GuestSignInPromptProps) {
  const pathname = useLocation().pathname;

  return (
    <EmptyState
      title={title}
      description={description}
      primaryAction={{ label: "Sign in", href: signInUrl(pathname) }}
    />
  );
}
