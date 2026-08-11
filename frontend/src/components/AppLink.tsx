import {
  Link as RouterLink,
  type LinkProps as RouterLinkProps,
  useLocation,
  useNavigate,
} from "react-router-dom";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children?: ReactNode;
  prefetch?: boolean;
  /** React Router location state (e.g. `{ from }` for back navigation). */
  state?: unknown;
};

function routerTo(
  href: string,
  currentPathname: string,
  currentSearch: string,
): RouterLinkProps["to"] {
  if (!href.includes("#")) return href;
  // Hash-only (#compare) must stay on the current route — URL(base) would make pathname "/".
  if (href.startsWith("#")) {
    return {
      pathname: currentPathname || "/",
      search: currentSearch,
      hash: href,
    };
  }
  const url = new URL(href, "https://social0.app");
  return {
    pathname: url.pathname || "/",
    search: url.search,
    hash: url.hash,
  };
}

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
  const to = routerTo(href, location.pathname, location.search);
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !href.includes("#")) return;

    if (href.startsWith("#")) {
      event.preventDefault();
      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: href,
        },
        state !== undefined ? { state } : undefined,
      );
      return;
    }

    const url = new URL(href, "https://social0.app");
    const samePath =
      url.pathname === location.pathname && url.search === location.search;
    if (!samePath) return;

    event.preventDefault();
    navigate(
      {
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
      },
      state !== undefined ? { state } : undefined,
    );
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
