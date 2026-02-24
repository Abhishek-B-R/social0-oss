"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { createAutoPlug } from "@/app/actions/resurface";
import { PostFormOptions } from "../PostFormOptions";
import { AutoFeaturesCard } from "@/components/repost/AutoFeaturesCard";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { AutoPlugConfig } from "@/components/autoplug/AutoPlugPanel";
import {
  MdFormatBold,
  MdFormatItalic,
  MdFormatStrikethrough,
  MdCode,
  MdLink,
  MdFormatQuote,
  MdFormatListBulleted,
  MdFormatListNumbered,
  MdLooksOne,
  MdLooksTwo,
  MdLooks3,
  MdFormatUnderlined,
} from "react-icons/md";

type Account = {
  id: string;
  platform: string;
  platformUsername: string | null;
  profileImageUrl: string | null;
  isActive: boolean | null;
};

const TOOLBAR_BUTTONS = [
  { icon: MdLooksOne, label: "Heading 1", wrap: (s: string) => `# ${s}` },
  { icon: MdLooksTwo, label: "Heading 2", wrap: (s: string) => `## ${s}` },
  { icon: MdLooks3, label: "Heading 3", wrap: (s: string) => `### ${s}` },
  { icon: MdFormatBold, label: "Bold", wrap: (s: string) => `**${s}**` },
  { icon: MdFormatItalic, label: "Italic", wrap: (s: string) => `*${s}*` },
  {
    icon: MdFormatUnderlined,
    label: "Underline",
    wrap: (s: string) => `<u>${s}</u>`,
  },
  {
    icon: MdFormatStrikethrough,
    label: "Strikethrough",
    wrap: (s: string) => `~~${s}~~`,
  },
  { icon: MdCode, label: "Code", wrap: (s: string) => `\`${s}\`` },
  { icon: MdLink, label: "Link", wrap: (s: string) => `[${s}](url)` },
  { icon: MdFormatQuote, label: "Quote", wrap: (s: string) => `> ${s}` },
  {
    icon: MdFormatListBulleted,
    label: "Bullet list",
    wrap: (s: string) => `- ${s}`,
  },
  {
    icon: MdFormatListNumbered,
    label: "Numbered list",
    wrap: (s: string) => `1. ${s}`,
  },
] as const;

export function BlogPostForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resurfaceConfig, setResurfaceConfig] =
    useState<AutoResurfaceConfig | null>(null);
  const [autoPlugConfig, setAutoPlugConfig] = useState<AutoPlugConfig | null>(
    null,
  );
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map((a) => a.id)));
    }
  };

  const insertMarkdown = (wrap: (s: string) => string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end) || "text";
    const replacement = wrap(selected);
    const before = content.slice(0, start);
    const after = content.slice(end);
    const newContent = before + replacement + after;
    setContent(newContent);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start, start + replacement.length);
    }, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await createPost(
      content.trim(),
      Array.from(selectedIds),
      mode,
      scheduledAt,
    );
    setLoading(false);
    if (result.success) {
      if (mode === "now" && result.postId && autoPlugConfig) {
        const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
        const xAccount = selectedAccounts.find(
          (a) => a.platform === "twitter_x",
        );
        if (xAccount) {
          await createAutoPlug(result.postId, xAccount.id, autoPlugConfig);
        }
      }
      router.push("/dashboard/posts");
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  const submitLabel =
    mode === "draft"
      ? "Save draft"
      : mode === "scheduled"
        ? "Schedule post"
        : "Publish";

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <label className="block text-sm font-semibold text-gray-900 px-6 pt-6 pb-2">
          Write your article (Markdown)
        </label>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 px-4 py-2 border-y border-gray-100 bg-gray-50/80">
          {TOOLBAR_BUTTONS.map(({ icon: Icon, label, wrap }) => (
            <button
              key={label}
              type="button"
              onClick={() => insertMarkdown(wrap)}
              className="p-2 rounded-lg text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors"
              title={label}
            >
              <Icon className="w-5 h-5" />
            </button>
          ))}
        </div>
        {/* Large markdown textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="# Title&#10;&#10;Start writing your blog post in Markdown. Use the toolbar above for headings, **bold**, *italic*, lists, code, links, and more."
          rows={20}
          className="w-full resize-y min-h-[400px] px-6 py-4 text-gray-900 placeholder-gray-400 border-0 focus:ring-0 focus:outline-none font-mono text-sm leading-relaxed"
          required
        />
      </div>

      <PostFormOptions
        accounts={accounts}
        selectedIds={selectedIds}
        onToggleAccount={toggleAccount}
        selectAll={selectAll}
        mode={mode}
        setMode={setMode}
        scheduledAt={scheduledAt}
        setScheduledAt={setScheduledAt}
        error={error}
        loading={loading}
        onCancel={() => router.push("/dashboard/posts")}
        submitLabel={submitLabel}
        submitDisabled={
          accounts.length === 0 || (mode === "scheduled" && !scheduledAt)
        }
        betweenScheduleAndActions={
          <AutoFeaturesCard
            selectedAccountIds={Array.from(selectedIds)}
            allAccounts={accounts}
            onResurfaceChange={setResurfaceConfig}
            onAutoPlugChange={setAutoPlugConfig}
          />
        }
      />
    </form>
  );
}
