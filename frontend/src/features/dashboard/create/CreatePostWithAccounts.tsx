
import { TextPostForm } from "./forms/TextPostForm";
import { ImagePostForm } from "./forms/ImagePostForm";
import { VideoPostForm } from "./forms/VideoPostForm";
import { ThreadsPostForm } from "./forms/ThreadsPostForm";
import { CollectionPostForm } from "./forms/CollectionPostForm";
import { useAccountsForForm } from "./useAccountsForForm";
import type { DateFormatKey } from "@social0/shared";
import type { SubscriptionTier } from "@social0/shared";

const FORM_MAP = {
  text: TextPostForm,
  image: ImagePostForm,
  video: VideoPostForm,
  threads: ThreadsPostForm,
  collection: CollectionPostForm,
} as const;

type ContentTypeSlug = keyof typeof FORM_MAP;

export type CreatePostWithAccountsProps = {
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
  subscriptionTier?: SubscriptionTier;
  freePostsUsed?: number;
  isGuest?: boolean;
};

export function CreatePostWithAccounts({
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
  subscriptionTier = "free",
  freePostsUsed = 0,
  isGuest = false,
}: CreatePostWithAccountsProps) {
  const { accounts, loading } = useAccountsForForm(supportedPlatforms);
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
        subscriptionTier={subscriptionTier}
        freePostsUsed={freePostsUsed}
        isGuest={isGuest}
      />
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
      subscriptionTier={subscriptionTier}
      freePostsUsed={freePostsUsed}
      isGuest={isGuest}
    />
  );
}
