"use client";

import { TextPostForm } from "./forms/TextPostForm";
import { ImagePostForm } from "./forms/ImagePostForm";
import { VideoPostForm } from "./forms/VideoPostForm";
import { ThreadsPostForm } from "./forms/ThreadsPostForm";
import { CollectionPostForm } from "./forms/CollectionPostForm";
import { useAccountsForForm } from "./useAccountsForForm";
import type { DateFormatKey } from "@/lib/date-format";

const FORM_MAP = {
  text: TextPostForm,
  image: ImagePostForm,
  video: VideoPostForm,
  threads: ThreadsPostForm,
  collection: CollectionPostForm,
} as const;

type ContentTypeSlug = keyof typeof FORM_MAP;

export type CreatePostWithAccountsClientProps = {
  contentTypeSlug: ContentTypeSlug;
  supportedPlatforms: string[];
  use24HourTimeFormat: boolean;
  dateFormat: DateFormatKey;
  timezone: string;
  draftId?: string;
  scheduledId?: string;
  editId?: string;
  allowAutoRepost: boolean;
  allowAutoPlug: boolean;
};

export function CreatePostWithAccountsClient({
  contentTypeSlug,
  supportedPlatforms,
  use24HourTimeFormat,
  dateFormat,
  timezone,
  draftId,
  scheduledId,
  editId,
  allowAutoRepost,
  allowAutoPlug,
}: CreatePostWithAccountsClientProps) {
  const { accounts, loading, error } = useAccountsForForm(supportedPlatforms);
  const FormComponent = FORM_MAP[contentTypeSlug];

  if (loading) {
    return (
      <FormComponent
        accounts={[]}
        accountsLoading={true}
        use24HourTimeFormat={use24HourTimeFormat}
        dateFormat={dateFormat}
        timezone={timezone}
        draftId={draftId}
        scheduledId={scheduledId}
        editId={editId}
        allowAutoRepost={allowAutoRepost}
        allowAutoPlug={allowAutoPlug}
        supportedPlatforms={supportedPlatforms}
      />
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
        {error}{" "}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-medium underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <FormComponent
      accounts={accounts}
      use24HourTimeFormat={use24HourTimeFormat}
      dateFormat={dateFormat}
      timezone={timezone}
      draftId={draftId}
      scheduledId={scheduledId}
      editId={editId}
      allowAutoRepost={allowAutoRepost}
      allowAutoPlug={allowAutoPlug}
      supportedPlatforms={supportedPlatforms}
    />
  );
}
