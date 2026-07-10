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
};

function routerTo(href: string): RouterLinkProps["to"] {
  if (!href.includes("#")) return href;
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
  prefetch: _prefetch,
  onClick,
  ...rest
}: AppLinkProps) {
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
  const to = routerTo(href);
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !href.includes("#")) return;

    const url = new URL(href, "https://social0.app");
    const samePath =
      url.pathname === location.pathname && url.search === location.search;
    if (!samePath) return;

    event.preventDefault();
    navigate({
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    });
  };

  return (
    <RouterLink
      to={to}
      onClick={handleClick}
      {...(rest as Omit<RouterLinkProps, "to" | "onClick">)}
    >
      {children}
    </RouterLink>
  );
}
