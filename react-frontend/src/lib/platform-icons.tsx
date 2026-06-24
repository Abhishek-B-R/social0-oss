import type { ComponentType, SVGProps } from "react";
import { FaLinkedin } from "react-icons/fa";
import {
  SiFacebook,
  SiBluesky,
  SiYoutube,
  SiPinterest,
  SiInstagram,
  SiTiktok,
  SiX,
  SiThreads,
} from "react-icons/si";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: string | number }>;

const PLATFORM_ICON_MAP: Record<string, IconComponent> = {
  linkedin: FaLinkedin,
  facebook: SiFacebook,
  bluesky: SiBluesky,
  youtube: SiYoutube,
  pinterest: SiPinterest,
  instagram: SiInstagram,
  tiktok: SiTiktok,
  twitter_x: SiX,
  threads: SiThreads,
};

/**
 * Maps platform id/slug to the corresponding Simple Icons (Si) component from react-icons/si.
 * Use everywhere: account selector bubbles, post cards, connections page, bulk tools.
 */
export function getPlatformIcon(platform: string): IconComponent | null {
  const normalized = platform?.toLowerCase().trim();
  const icon = normalized ? PLATFORM_ICON_MAP[normalized] : undefined;
  return icon ?? null;
}
