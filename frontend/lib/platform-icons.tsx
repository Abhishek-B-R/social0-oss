import type { ComponentType, SVGProps } from "react";
import {
  SiLinkedin,
  SiFacebook,
  SiBluesky,
  SiHashnode,
  SiYoutube,
  SiPinterest,
  SiInstagram,
  SiTiktok,
  SiX,
  SiThreads,
  SiDevdotto,
  SiMedium,
} from "react-icons/si";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: string | number }>;

const PLATFORM_ICON_MAP: Record<string, IconComponent> = {
  linkedin: SiLinkedin,
  facebook: SiFacebook,
  bluesky: SiBluesky,
  hashnode: SiHashnode,
  youtube: SiYoutube,
  pinterest: SiPinterest,
  instagram: SiInstagram,
  tiktok: SiTiktok,
  twitter_x: SiX,
  threads: SiThreads,
  devto: SiDevdotto,
  medium: SiMedium,
};

/**
 * Maps platform id/slug to the corresponding Simple Icons (Si) component from react-icons/si.
 * Use everywhere: account selector bubbles, post cards, connections page, bulk tools.
 */
export function getPlatformIcon(platform: string): IconComponent | null {
  const normalized = platform?.toLowerCase().trim();
  return (normalized && PLATFORM_ICON_MAP[normalized]) ?? null;
}
