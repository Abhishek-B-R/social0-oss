"use client";

import Link from "next/link";
import {
  SiLinkedin,
  SiInstagram,
  SiYoutube,
  SiPinterest,
  SiTiktok,
  SiX,
  SiThreads,
  SiBluesky,
  SiFacebook,
  SiDevdotto,
  SiHashnode,
  SiMedium,
} from "react-icons/si";
import { HiOutlineDocumentText } from "react-icons/hi";
import { MdOutlineImage, MdOutlineVideoLibrary, MdOutlineCollections } from "react-icons/md";
import { TbListDetails } from "react-icons/tb";
import { CONTENT_TYPES } from "@/lib/content-types";

const PLATFORM_DISPLAY: Record<
  string,
  { name: string; icon: typeof SiLinkedin; color: string }
> = {
  linkedin: { name: "LinkedIn", icon: SiLinkedin, color: "bg-[#0A66C2]" },
  facebook: { name: "Facebook", icon: SiFacebook, color: "bg-[#1877F2]" },
  bluesky: { name: "Bluesky", icon: SiBluesky, color: "bg-[#0085FF]" },
  hashnode: { name: "Hashnode", icon: SiHashnode, color: "bg-[#2962FF]" },
  youtube: { name: "YouTube", icon: SiYoutube, color: "bg-[#FF0000]" },
  pinterest: { name: "Pinterest", icon: SiPinterest, color: "bg-[#E60023]" },
  instagram: {
    name: "Instagram",
    icon: SiInstagram,
    color: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
  },
  tiktok: { name: "TikTok", icon: SiTiktok, color: "bg-[#000000]" },
  twitter_x: { name: "X", icon: SiX, color: "bg-[#000000]" },
  threads: { name: "Threads", icon: SiThreads, color: "bg-[#000000]" },
  devto: { name: "Dev.to", icon: SiDevdotto, color: "bg-[#0A0A0A]" },
  medium: { name: "Medium", icon: SiMedium, color: "bg-[#000000]" },
};

const CONTENT_TYPE_ICONS: Record<
  (typeof CONTENT_TYPES)[number]["id"],
  typeof HiOutlineDocumentText
> = {
  text: HiOutlineDocumentText,
  image: MdOutlineImage,
  video: MdOutlineVideoLibrary,
  blog: HiOutlineDocumentText,
  threads: TbListDetails,
  collection: MdOutlineCollections,
};

function ContentTypeCard({
  id,
  slug,
  name,
  platforms,
}: {
  id: (typeof CONTENT_TYPES)[number]["id"];
  slug: string;
  name: string;
  platforms: readonly string[];
}) {
  const Icon = CONTENT_TYPE_ICONS[id];
  return (
    <Link
      href={`/dashboard/posts/new/${slug}`}
      className="group flex flex-col rounded-2xl border-2 border-dashed border-gray-300 bg-white p-6 shadow-sm transition-all hover:border-emerald-400 hover:bg-emerald-50/30 hover:shadow-md"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-600 group-hover:bg-emerald-100 group-hover:text-emerald-700">
        {Icon && <Icon className="h-6 w-6" />}
      </div>
      <h3 className="mb-3 font-semibold text-gray-900">{name}</h3>
      <div className="mt-auto flex flex-wrap gap-1.5">
        {platforms.map((platformId) => {
          const p = PLATFORM_DISPLAY[platformId];
          if (!p) return null;
          const Icon = p.icon;
          return (
            <span
              key={platformId}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${p.color} text-white shadow-sm`}
              title={p.name}
            >
              <Icon className="h-4 w-4" />
            </span>
          );
        })}
      </div>
    </Link>
  );
}

export function NewPostTypeSelector() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {CONTENT_TYPES.map((type) => (
          <ContentTypeCard
            key={type.id}
            id={type.id}
            slug={type.slug}
            name={type.name}
            platforms={type.platforms}
          />
        ))}
      </div>
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          ✓
        </span>
        You can connect more accounts{" "}
        <Link
          href="/dashboard"
          className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
        >
          here
        </Link>
        .
      </p>
    </div>
  );
}
