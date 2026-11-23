import { PLATFORM_LABEL } from "@/lib/platforms";

/** Human name for a platform id ("twitter_x" → "X"). Unknown ids pass through. */
export function networkLabel(network: string): string {
  return PLATFORM_LABEL[network] ?? network;
}
