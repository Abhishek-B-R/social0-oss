import {
  Link as RouterLink,
  type LinkProps as RouterLinkProps,
  useLocation,
  useNavigate,
} from "react-router-dom";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { resolveAppLinkTo } from "@/lib/app-link-to";

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children?: ReactNode;
  prefetch?: boolean;
  /** React Router location state (e.g. `{ from }` for back navigation). */
  state?: unknown;
};

export default function AppLink({
  href,
  children,
  prefetch,
  onClick,
  state,
  ...rest
}: AppLinkProps) {
  // Accepted for API compatibility; not forwarded to the DOM/router link.
  void prefetch;
  const location = useLocation();
  const navigate = useNavigate();
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
  const to = resolveAppLinkTo(href, location.pathname, location.search);
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !href.includes("#")) return;

    if (typeof to === "string") return;

    const samePath = to.pathname === location.pathname;
    if (!samePath) return;

    event.preventDefault();
    navigate(to, state !== undefined ? { state } : undefined);
  };

  return (
    <RouterLink
      to={to}
      state={state}
      onClick={handleClick}
      {...(rest as Omit<RouterLinkProps, "to" | "onClick" | "state">)}
    >
      {children}
    </RouterLink>
  );
}
