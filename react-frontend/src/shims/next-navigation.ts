import { useMemo } from "react";
import {
  useNavigate,
  useLocation,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom";
import { useRouterRefresh } from "@/lib/router-refresh";

export function useRouter() {
  const navigate = useNavigate();
  const { refresh } = useRouterRefresh();
  return useMemo(
    () => ({
      push: (href: string, _opts?: { scroll?: boolean }) => navigate(href),
      replace: (href: string, _opts?: { scroll?: boolean }) =>
        navigate(href, { replace: true }),
      back: () => navigate(-1),
      forward: () => navigate(1),
      refresh,
      prefetch: (_href: string) => {},
    }),
    [navigate, refresh],
  );
}

export function usePathname() {
  return useLocation().pathname;
}

export function useSearchParams() {
  const [params] = useRouterSearchParams();
  const search = params.toString();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useParams<
  T extends Record<string, string | undefined> = Record<string, string | undefined>,
>() {
  return useRouterParams() as T;
}

export function redirect(url: string): never {
  if (typeof window !== "undefined") {
    window.location.assign(url);
  }
  throw new Error(`REDIRECT:${url}`);
}

export function notFound(): never {
  throw new Error("NOT_FOUND");
}
