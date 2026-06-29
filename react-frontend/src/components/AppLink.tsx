import {
  Link as RouterLink,
  type LinkProps as RouterLinkProps,
} from "react-router-dom";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children?: ReactNode;
  prefetch?: boolean;
};

export default function AppLink({
  href,
  children,
  prefetch: _prefetch,
  ...rest
}: AppLinkProps) {
  // API routes must be full page loads (OAuth redirects), not client-side router navigation.
  if (
    href.startsWith("http") ||
    href.startsWith("/api/") ||
    href.startsWith("/v1/")
  ) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <RouterLink to={href} {...(rest as Omit<RouterLinkProps, "to">)}>
      {children}
    </RouterLink>
  );
}
