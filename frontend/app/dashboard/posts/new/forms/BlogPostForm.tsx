"use client";

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createPost, type PublishMode } from "@/app/actions/posts";
import { createAutoPlug } from "@/app/actions/resurface";
import { PostFormOptions } from "../PostFormOptions";
import { SchedulePostSidebar } from "../SchedulePostSidebar";
import { getResurfacePlatforms } from "@/lib/resurface-utils";
import type { AutoResurfaceConfig } from "@/components/repost/AutoResurfacePanel";
import type { AutoPlugConfig, ConnectedAccount } from "@/components/autoplug/AutoPlugPanel";
import { AutoResurfaceSettingsModal } from "@/components/repost/AutoResurfaceSettingsModal";
import { AutoPlugSettingsModal } from "@/components/autoplug/AutoPlugSettingsModal";
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
  tokenExpired?: boolean;
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

export function BlogPostForm({
  accounts,
  use24HourTimeFormat = false,
}: {
  accounts: Account[];
  use24HourTimeFormat?: boolean;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const intendedModeRef = useRef<PublishMode | null>(null);
  const [content, setContent] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resurfaceConfig, setResurfaceConfig] =
    useState<AutoResurfaceConfig | null>(null);
  const [autoPlugConfig, setAutoPlugConfig] = useState<AutoPlugConfig | null>(
    null,
  );
  const [resurfaceModalOpen, setResurfaceModalOpen] = useState(false);
  const [autoplugModalOpen, setAutoplugModalOpen] = useState(false);
  const configBeforeResurfaceRef = useRef<AutoResurfaceConfig | null>(null);
  const configBeforeAutoPlugRef = useRef<AutoPlugConfig | null>(null);
  const [mode, setMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContentError, setShowContentError] = useState(false);

  const trimmed = content.trim();
  const [firstLine, ...restLines] = trimmed.split(/\r?\n/);
  const titleLine = firstLine.trim();
  const bodyText = restLines.join("\n").trim();
  const hasTitle = titleLine.length > 0;
  const hasBody = bodyText.length > 0;
  const isBlogValid = hasTitle && hasBody;

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableAccounts = accounts.filter((a) => !a.tokenExpired);
  const selectAll = () => {
    if (selectableAccounts.every((a) => selectedIds.has(a.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableAccounts.map((a) => a.id)));
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
    if (!isBlogValid) {
      setShowContentError(true);
      return;
    }
    setShowContentError(false);
    setLoading(true);
    const effectiveMode = intendedModeRef.current ?? mode;
    intendedModeRef.current = null;
    const result = await createPost(
      content.trim(),
      Array.from(selectedIds),
      effectiveMode,
      scheduledAt,
      [],
    );
    setLoading(false);
    if (result.success) {
      if (effectiveMode === "now" && result.postId && autoPlugConfig) {
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

  const selectedAccountIds = Array.from(selectedIds);
  const hasXForResurface =
    getResurfacePlatforms(selectedAccountIds, accounts).length > 0;
  const resurfaceVisible = hasXForResurface;
  const autoPlugVisible = hasXForResurface;

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return accounts;
    const q = accountSearch.toLowerCase().trim();
    return accounts.filter(
      (a) =>
        a.platformUsername?.toLowerCase().includes(q) ||
        a.platform?.toLowerCase().includes(q),
    );
  }, [accounts, accountSearch]);

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-6 lg:max-w-[65%]">
        <PostFormOptions
            accounts={filteredAccounts}
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
              accounts.length === 0 ||
              !isBlogValid ||
              (mode === "scheduled" && !scheduledAt)
            }
            use24HourTimeFormat={use24HourTimeFormat}
            hideScheduleAndActions
            searchSlot={
              <input
                type="search"
                placeholder="Search accounts..."
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="h-8 w-full text-xs rounded border border-border px-2 py-1 text-text placeholder-text-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
              />
            }
          />

      <div className="rounded-2xl border border-border bg-bg shadow-sm overflow-hidden">
        <label className="block text-sm font-semibold text-text px-6 pt-6 pb-2">
          Write your article (Markdown)
        </label>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 px-4 py-2 border-y border-border-subtle bg-bg-subtle">
          {TOOLBAR_BUTTONS.map(({ icon: Icon, label, wrap }) => (
            <button
              key={label}
              type="button"
              onClick={() => insertMarkdown(wrap)}
              className="p-2 rounded-lg text-text-muted hover:bg-bg-muted hover:text-text transition-colors"
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
          className="w-full resize-y min-h-[400px] px-6 py-4 text-text placeholder-text-subtle border-0 focus:ring-0 focus:outline-none font-mono text-sm leading-relaxed"
          required
        />
        {showContentError && !isBlogValid && (
          <p className="px-6 pb-4 text-xs text-destructive">
            Title and content are required
          </p>
        )}
      </div>

      </div>

      <SchedulePostSidebar
        mode={mode}
        setMode={setMode}
        scheduledAt={scheduledAt}
        setScheduledAt={setScheduledAt}
        loading={loading}
        submitDisabled={
          accounts.length === 0 ||
          !isBlogValid ||
          (mode === "scheduled" && !scheduledAt)
        }
        hasAccountSelected={selectedIds.size > 0}
        error={error}
        use24HourTimeFormat={use24HourTimeFormat}
        onCancel={() => router.push("/dashboard/posts")}
        intendedModeRef={intendedModeRef}
        formRef={formRef}
        autoRepost={
          resurfaceVisible
            ? {
                visible: true,
                enabled: !!resurfaceConfig,
                onToggle: () => {
                  if (resurfaceConfig) setResurfaceConfig(null);
                  else {
                    configBeforeResurfaceRef.current = resurfaceConfig;
                    setResurfaceModalOpen(true);
                  }
                },
                onOpenSettings: () => {
                  configBeforeResurfaceRef.current = resurfaceConfig;
                  setResurfaceModalOpen(true);
                },
              }
            : null
        }
        autoPlug={
          autoPlugVisible
            ? {
                visible: true,
                enabled: !!autoPlugConfig,
                onToggle: () => {
                  if (autoPlugConfig) setAutoPlugConfig(null);
                  else {
                    configBeforeAutoPlugRef.current = autoPlugConfig;
                    setAutoplugModalOpen(true);
                  }
                },
                onOpenSettings: () => {
                  configBeforeAutoPlugRef.current = autoPlugConfig;
                  setAutoplugModalOpen(true);
                },
              }
            : null
        }
      />

      {resurfaceModalOpen && (
        <AutoResurfaceSettingsModal
          isOpen={true}
          selectedAccountIds={selectedAccountIds}
          allAccounts={accounts}
          initialConfig={resurfaceConfig}
          onChange={setResurfaceConfig}
          onDone={() => setResurfaceModalOpen(false)}
          onCancel={() => {
            setResurfaceConfig(configBeforeResurfaceRef.current ?? null);
            setResurfaceModalOpen(false);
          }}
          use24HourTimeFormat={use24HourTimeFormat}
        />
      )}
      {autoplugModalOpen && (
        <AutoPlugSettingsModal
          isOpen={true}
          selectedAccountIds={selectedAccountIds}
          allAccounts={accounts as ConnectedAccount[]}
          initialConfig={autoPlugConfig}
          onChange={setAutoPlugConfig}
          onDone={() => setAutoplugModalOpen(false)}
          onCancel={() => {
            setAutoPlugConfig(configBeforeAutoPlugRef.current ?? null);
            setAutoplugModalOpen(false);
          }}
        />
      )}
    </form>
  );
}
