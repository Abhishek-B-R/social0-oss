import type { DateWindow, DateWindowRange } from "@/lib/date-window";
import { windowQueryParams } from "@/lib/date-window";
import { nextInboxPageParam } from "./inbox-page-param";

export type InboxPageParam = {
  range: DateWindowRange;
  since?: string;
  until?: string;
  before?: string;
};

export function initialInboxPageParam(dateWindow: DateWindow): InboxPageParam {
  return windowQueryParams(dateWindow);
}

export { nextInboxPageParam };
