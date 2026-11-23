import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { PLANS_PARAM } from "@/features/onboarding/lib/paths";

/** `?plans=1` on any onboarding step opens the plans dialog. */
export function usePlansDialog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const open = searchParams.get(PLANS_PARAM) === "1";
  const setOpen = useCallback(
    (next: boolean) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next) p.set(PLANS_PARAM, "1");
          else p.delete(PLANS_PARAM);
          return p;
        },
        { replace: !next },
      );
    },
    [setSearchParams],
  );
  return { open, setOpen };
}
