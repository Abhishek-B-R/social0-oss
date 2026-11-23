import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { uploadFile } from "@/lib/upload-file";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { settingsInputClass } from "../settings-ui";

const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Profile picture: upload (JPEG/PNG/GIF/WebP, under 2MB) or paste a URL.
 * Saves as soon as the upload finishes; the preview updates right away.
 */
export function AvatarEditor({
  currentUrl,
  displayLabel,
  onSave,
  subject = "your profile picture",
}: {
  currentUrl: string | null;
  displayLabel: string;
  onSave: (url: string) => Promise<{ error?: string }>;
  /** What the picture belongs to, for the toasts ("this account's picture"). */
  subject?: string;
}) {
  const urlInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "url" | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [syncedUrl, setSyncedUrl] = useState(currentUrl);
  if (syncedUrl !== currentUrl) {
    setSyncedUrl(currentUrl);
    setPreviewUrl(currentUrl);
  }
  const displaySrc = previewUrl?.trim() || null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = !!displaySrc && failedSrc !== displaySrc;

  const save = async (url: string, kind: "upload" | "url") => {
    const result = await onSave(url);
    if (result.error) {
      toast.error(`Couldn't update ${subject}`, { description: result.error });
      return false;
    }
    setPreviewUrl(url);
    const noun = subject.replace(/^your /, "");
    const updated = `${noun.charAt(0).toUpperCase()}${noun.slice(1)} updated`;
    toast.success(kind === "upload" ? updated : `${updated} from link`);
    return true;
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast.error("That file type isn't supported", {
        description: "Use a JPEG, PNG, GIF or WebP image.",
      });
      return;
    }
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      toast.error("That image is too big", { description: "Pick one under 2MB." });
      return;
    }
    setBusy("upload");
    try {
      const { url } = await uploadFile(file, 0);
      if (!url) {
        toast.error("Upload failed", { description: "Try again in a moment." });
        return;
      }
      await save(url, "upload");
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Paste a full image link", { description: "It should start with https://" });
      return;
    }
    setBusy("url");
    try {
      if (await save(url, "url")) setUrlInput("");
    } finally {
      setBusy(null);
    }
  };

  // Sized by its container, not the viewport: the same editor sits in the
  // wide Settings page and in the narrow account drawer.
  return (
    <div className="@container">
      <div className="flex flex-col gap-4 @lg:flex-row @lg:items-center">
        <div className="flex items-center gap-3">
          {showImage ? (
            <img
              key={displaySrc}
              src={displaySrc}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setFailedSrc(displaySrc)}
              className="size-14 shrink-0 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <div
              aria-hidden
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-bg-muted text-lg font-semibold text-text-muted"
            >
              {displayLabel.charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_AVATAR_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void handleFile(e)}
            disabled={!!busy}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {busy === "upload" ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Upload aria-hidden />
            )}
            {busy === "upload" ? "Uploading…" : "Upload image"}
          </Button>
        </div>
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleUrl();
          }}
        >
          <label htmlFor={urlInputId} className="sr-only">
            Image link
          </label>
          <input
            id={urlInputId}
            type="url"
            inputMode="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Or paste an image link"
            disabled={!!busy}
            className={cn(settingsInputClass, "min-w-0 flex-1")}
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className="h-9 touch:h-11"
            disabled={!!busy || !urlInput.trim()}
          >
            {busy === "url" ? "Saving…" : "Use link"}
          </Button>
        </form>
      </div>
    </div>
  );
}
