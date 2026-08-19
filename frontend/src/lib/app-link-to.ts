import type { To } from "react-router-dom";

/**
 * Build a React Router `to` from an AppLink href.
 * Same-path links without an explicit `?` keep the current search (e.g. `?mode=normal`
 * on `/#features`). Hash-only (`#section`) always stays on the current route.
 */
export function resolveAppLinkTo(
  href: string,
  currentPathname: string,
  currentSearch: string,
): To {
  const pathname = currentPathname || "/";

  if (href.startsWith("#")) {
    return {
      pathname,
      search: currentSearch,
      hash: href,
    };
  }

  const url = new URL(href, "https://social0.app");
  const destPath = url.pathname || "/";
  const destHasExplicitSearch = href.includes("?");
  const search =
    !destHasExplicitSearch && destPath === pathname
      ? currentSearch
      : url.search;

  if (!href.includes("#") && !search) {
    return href;
  }

  return {
    pathname: destPath,
    search,
    hash: url.hash,
  };
}
