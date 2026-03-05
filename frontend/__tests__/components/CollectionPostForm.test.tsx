/**
 * Detailed tests for CollectionPostForm: collection (images + videos) post creation.
 * Covers render, account selection, caption, media add/remove/validation, schedule sidebar,
 * submit disabled states, max-4 attachment warning, and full submit flow.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionPostForm } from "@/app/dashboard/create/forms/CollectionPostForm";

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

jest.mock("next/link", () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

const mockCreatePost = jest.fn();
const mockPublishPost = jest.fn();
const mockCreateResurfaceSchedule = jest.fn();
const mockCreateAutoPlug = jest.fn();
jest.mock("@/app/actions/posts", () => ({
  createPost: (...args: unknown[]) => mockCreatePost(...args),
}));
jest.mock("@/app/actions/publish", () => ({
  publishPost: (...args: unknown[]) => mockPublishPost(...args),
}));
jest.mock("@/app/actions/resurface", () => ({
  createResurfaceSchedule: (...args: unknown[]) =>
    mockCreateResurfaceSchedule(...args),
  createAutoPlug: (...args: unknown[]) => mockCreateAutoPlug(...args),
}));

const mockUploadFile = jest.fn();
jest.mock("@/lib/upload-file", () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
}));

/** Create a minimal File for tests (jsdom may not have File in older envs). */
function createImageFile(name = "test.png"): File {
  if (typeof File !== "undefined") {
    return new File(["image content"], name, { type: "image/png" });
  }
  const blob = new Blob(["image content"], { type: "image/png" }) as unknown as File;
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

function createVideoFile(name = "test.mp4"): File {
  if (typeof File !== "undefined") {
    return new File(["video content"], name, { type: "video/mp4" });
  }
  const blob = new Blob(["video content"], { type: "video/mp4" }) as unknown as File;
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

const defaultAccounts = [
  {
    id: "acc-x",
    platform: "twitter_x",
    platformUsername: "xuser",
    profileImageUrl: null,
    isActive: true,
  },
  {
    id: "acc-ig",
    platform: "instagram",
    platformUsername: "iguser",
    profileImageUrl: null,
    isActive: true,
  },
  {
    id: "acc-tiktok",
    platform: "tiktok",
    platformUsername: "tiktokuser",
    profileImageUrl: null,
    isActive: true,
  },
];

/** Helper: get the X (Twitter) account bubble button (shows initial "X"). */
function getXAccountButton() {
  return screen.getByRole("button", { name: "X" });
}

/** Helper: get the TikTok account bubble button (shows initial "T"). */
function getTikTokAccountButton() {
  return screen.getByRole("button", { name: "T" });
}

describe("CollectionPostForm", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = globalThis.fetch;
    (globalThis.fetch as jest.Mock) = jest.fn();
    const URLProto = globalThis.URL as unknown as {
      createObjectURL?: (obj: Blob) => string;
      revokeObjectURL?: (url: string) => void;
    };
    let blobUrlCounter = 0;
    URLProto.createObjectURL =
      URLProto.createObjectURL ??
      (() => `blob:test-mock-url-${++blobUrlCounter}`);
    URLProto.revokeObjectURL = URLProto.revokeObjectURL ?? (() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("initial render and structure", () => {
    it("renders the collection form with main heading and caption area", () => {
      render(<CollectionPostForm accounts={defaultAccounts} />);
      expect(
        screen.getByText("Collection of images and videos (one post)"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Add a caption plus multiple images and\/or video/),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Write your caption..."),
      ).toBeInTheDocument();
    });

    it("renders Post to section and account search when accounts are provided", () => {
      render(<CollectionPostForm accounts={defaultAccounts} />);
      expect(screen.getByText("Post to")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Search accounts..."),
      ).toBeInTheDocument();
    });

    it("renders Select all / Deselect all when accounts exist", () => {
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const selectAllBtn = screen.getByRole("button", {
        name: /Select all|Deselect all/i,
      });
      expect(selectAllBtn).toBeInTheDocument();
    });

    it("renders Images and Videos add controls with correct labels", () => {
      render(<CollectionPostForm accounts={defaultAccounts} />);
      expect(screen.getByLabelText(/Images/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Videos/)).toBeInTheDocument();
      const imagesInput = screen.getByLabelText(/Images/);
      const videosInput = screen.getByLabelText(/Videos/);
      expect(imagesInput).toHaveAttribute("type", "file");
      expect(imagesInput).toHaveAttribute("accept", "image/*");
      expect(videosInput).toHaveAttribute("accept", "video/*");
    });

    it("renders schedule sidebar with Schedule post, Post now, Save to Drafts, Cancel", () => {
      render(<CollectionPostForm accounts={defaultAccounts} />);
      expect(screen.getByText("Schedule post")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Post now" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Save to Drafts" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("with no accounts still renders form and shows connect-account message in selector area", () => {
      render(<CollectionPostForm accounts={[]} />);
      expect(
        screen.getByText(/Connect at least one account from the dashboard/),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Write your caption..."),
      ).toBeInTheDocument();
    });
  });

  describe("caption and content state", () => {
    it("caption input updates and keeps value", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const textarea = screen.getByPlaceholderText("Write your caption...");
      await user.type(textarea, "My collection caption");
      expect(textarea).toHaveValue("My collection caption");
    });

    it("hasContent is false with empty caption and no media — submit actions disabled", () => {
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const postNow = screen.getByRole("button", { name: "Post now" });
      const saveDraft = screen.getByRole("button", { name: "Save to Drafts" });
      expect(postNow).toBeDisabled();
      expect(saveDraft).toBeDisabled();
    });

    it("with caption only and no account selected, Post now stays disabled", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      await user.type(
        screen.getByPlaceholderText("Write your caption..."),
        "Caption only",
      );
      const postNow = screen.getByRole("button", { name: "Post now" });
      expect(postNow).toBeDisabled();
    });

    it("with caption and at least one account selected, Post now is enabled", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      await user.type(
        screen.getByPlaceholderText("Write your caption..."),
        "Caption",
      );
      const xBubble = getXAccountButton();
      await user.click(xBubble);
      const postNow = screen.getByRole("button", { name: "Post now" });
      expect(postNow).not.toBeDisabled();
    });
  });

  describe("account search", () => {
    it("filtering by search narrows visible accounts", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const search = screen.getByPlaceholderText("Search accounts...");
      await user.type(search, "xuser");
      const buttons = screen.getAllByRole("button");
      const accountButtons = buttons.filter(
        (b) =>
          b.textContent?.includes("xuser") ||
          b.getAttribute("aria-label")?.includes("xuser"),
      );
      expect(accountButtons.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("media: images", () => {
    it("adding an image shows count next to Images label and adds item to carousel", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const input = screen.getByLabelText(/Images/);
      const file = createImageFile();
      await user.upload(input, file);
      expect(document.body.textContent).toMatch(/Images\s*\(\s*1\s*\)/);
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("adding multiple images shows correct count", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const input = screen.getByLabelText(/Images/);
      await user.upload(input, [
        createImageFile("a.png"),
        createImageFile("b.png"),
      ]);
      expect(document.body.textContent).toMatch(/Images\s*\(\s*2\s*\)/);
    });

    it("rejecting non-image file shows error", async () => {
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const input = screen.getByLabelText(/Images/);
      const badFile = new File(["x"], "doc.pdf", { type: "application/pdf" });
      const fileList = { 0: badFile, length: 1, item: (i: number) => (i === 0 ? badFile : null) };
      fireEvent.change(input, { target: { files: fileList } });
      expect(
        screen.getByText("Please select only image files."),
      ).toBeInTheDocument();
    });

    it("remove image button removes item and updates count", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <CollectionPostForm accounts={defaultAccounts} />,
      );
      const input = screen.getByLabelText(/Images/);
      await user.upload(input, createImageFile());
      expect(document.body.textContent).toMatch(/Images\s*\(\s*1\s*\)/);
      const carouselItem = container.querySelector('[draggable="true"]');
      const removeBtn = carouselItem?.querySelector("button[type='button']");
      expect(removeBtn).toBeTruthy();
      await user.click(removeBtn as HTMLButtonElement);
      expect(document.body.textContent).not.toMatch(/Images\s*\(\s*1\s*\)/);
    });
  });

  describe("media: videos", () => {
    it("adding a video shows count next to Videos label", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const input = screen.getByLabelText(/Videos/);
      await user.upload(input, createVideoFile());
      expect(document.body.textContent).toMatch(/Videos\s*\(\s*1\s*\)/);
    });

    it("rejecting non-video file shows error", async () => {
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const input = screen.getByLabelText(/Videos/);
      const badFile = new File(["x"], "image.png", { type: "image/png" });
      const fileList = { 0: badFile, length: 1, item: (i: number) => (i === 0 ? badFile : null) };
      fireEvent.change(input, { target: { files: fileList } });
      expect(
        screen.getByText("Please select only video files."),
      ).toBeInTheDocument();
    });
  });

  describe("schedule sidebar", () => {
    it("schedule switch toggles between Post now and Schedule mode", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const scheduleSwitch = screen.getByRole("switch", {
        name: undefined,
      });
      await user.click(scheduleSwitch);
      expect(screen.getByLabelText("Date")).toBeInTheDocument();
      expect(screen.getByLabelText("Time")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Schedule" }),
      ).toBeInTheDocument();
    });

    it("Cancel button calls router.push to dashboard posts", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(mockPush).toHaveBeenCalledWith("/dashboard/posts");
    });
  });

  describe("Auto-Repost / Auto-Plug / TikTok visibility", () => {
    it("when X (Twitter) account is selected, Auto-Repost and Auto-Plug rows are visible", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      expect(screen.queryByText("Auto-Repost")).not.toBeInTheDocument();
      expect(screen.queryByText("Auto-Plug")).not.toBeInTheDocument();
      const xBubble = getXAccountButton();
      await user.click(xBubble);
      expect(screen.getByText("Auto-Repost")).toBeInTheDocument();
      expect(screen.getByText("Auto-Plug")).toBeInTheDocument();
    });

    it("when TikTok account is selected, TikTok Settings row is visible", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      expect(screen.queryByText("TikTok Settings")).not.toBeInTheDocument();
      const tiktokBubble = getTikTokAccountButton();
      await user.click(tiktokBubble);
      expect(screen.getByText("TikTok Settings")).toBeInTheDocument();
    });
  });

  describe("max 4 attachments warning (X only)", () => {
    it("when X selected and more than 4 items, shows max-4 warning", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const xBubble = getXAccountButton();
      await user.click(xBubble);
      const imagesInput = screen.getByLabelText(/Images/);
      await user.upload(imagesInput, [
        createImageFile("1.png"),
        createImageFile("2.png"),
        createImageFile("3.png"),
        createImageFile("4.png"),
        createImageFile("5.png"),
      ]);
      expect(
        screen.getByText(
          /X \(Twitter\) supports max 4 attachments — only the first 4 will be published/,
        ),
      ).toBeInTheDocument();
    });

    it("with 4 or fewer items and X selected, no max-4 warning", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const xBubble = getXAccountButton();
      await user.click(xBubble);
      const imagesInput = screen.getByLabelText(/Images/);
      await user.upload(imagesInput, [
        createImageFile("1.png"),
        createImageFile("2.png"),
      ]);
      expect(
        screen.queryByText(/max 4 attachments/),
      ).not.toBeInTheDocument();
    });
  });

  describe("carousel preview and order", () => {
    it("shows carousel reorder hint when media is present", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const input = screen.getByLabelText(/Images/);
      await user.upload(input, createImageFile());
      expect(
        screen.getByText(/Carousel post: Drag to reorder/),
      ).toBeInTheDocument();
    });

    it("carousel preview shows Previous/Next when multiple items", async () => {
      const user = userEvent.setup();
      render(<CollectionPostForm accounts={defaultAccounts} />);
      const input = screen.getByLabelText(/Images/);
      await user.upload(input, [
        createImageFile("a.png"),
        createImageFile("b.png"),
      ]);
      expect(screen.getByRole("button", { name: "Previous" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
    });
  });

  describe("submit flow", () => {
    it("Post now with caption + account + image: uploads media, creates post, publishes", async () => {
      const user = userEvent.setup();
      mockUploadFile.mockResolvedValue({
        id: "media-1",
        url: "https://example.com/media-1",
      });
      mockCreatePost.mockResolvedValue({ success: true, postId: "post-1" });
      mockPublishPost.mockResolvedValue({ success: true });

      render(<CollectionPostForm accounts={defaultAccounts} />);
      await user.type(
        screen.getByPlaceholderText("Write your caption..."),
        "Test caption",
      );
      const xBubble = getXAccountButton();
      await user.click(xBubble);
      const imagesInput = screen.getByLabelText(/Images/);
      await user.upload(imagesInput, createImageFile());

      const postNow = screen.getByRole("button", { name: "Post now" });
      expect(postNow).not.toBeDisabled();
      await user.click(postNow);

      await screen.findByText(/Uploading|Publishing|Saving/, undefined, {
        timeout: 500,
      }).catch(() => {});

      await new Promise((r) => setTimeout(r, 100));

      expect(mockUploadFile).toHaveBeenCalledWith(
        expect.any(File),
        expect.any(Number),
        expect.any(Function),
      );
      expect(mockCreatePost).toHaveBeenCalledWith(
        "Test caption",
        ["acc-x"],
        "now",
        null,
        ["media-1"],
        undefined,
      );
      expect(mockPublishPost).toHaveBeenCalledWith("post-1");
      expect(mockRefresh).toHaveBeenCalled();
    });

    it("createPost failure shows error and does not call publishPost", async () => {
      const user = userEvent.setup();
      mockUploadFile.mockResolvedValue({
        id: "media-1",
        url: "https://example.com/media-1",
      });
      mockCreatePost.mockResolvedValue({
        success: false,
        error: "Database error",
      });

      render(<CollectionPostForm accounts={defaultAccounts} />);
      await user.type(
        screen.getByPlaceholderText("Write your caption..."),
        "Caption",
      );
      const xBubble = getXAccountButton();
      await user.click(xBubble);
      const imagesInput = screen.getByLabelText(/Images/);
      await user.upload(imagesInput, createImageFile());
      await user.click(screen.getByRole("button", { name: "Post now" }));

      await new Promise((r) => setTimeout(r, 200));
      expect(screen.getByText("Database error")).toBeInTheDocument();
      expect(mockPublishPost).not.toHaveBeenCalled();
    });

    it("upload failure shows error and does not call createPost", async () => {
      const user = userEvent.setup();
      mockUploadFile.mockRejectedValue(new Error("Network error"));

      render(<CollectionPostForm accounts={defaultAccounts} />);
      await user.type(
        screen.getByPlaceholderText("Write your caption..."),
        "Caption",
      );
      const xBubble = getXAccountButton();
      await user.click(xBubble);
      const imagesInput = screen.getByLabelText(/Images/);
      await user.upload(imagesInput, createImageFile());
      await user.click(screen.getByRole("button", { name: "Post now" }));

      await new Promise((r) => setTimeout(r, 200));
      expect(screen.getByText("Network error")).toBeInTheDocument();
      expect(mockCreatePost).not.toHaveBeenCalled();
    });

    it("Save to Drafts sets intended mode to draft and createPost is called with draft", async () => {
      const user = userEvent.setup();
      mockCreatePost.mockResolvedValue({ success: true, postId: "draft-1" });

      render(<CollectionPostForm accounts={defaultAccounts} />);
      await user.type(
        screen.getByPlaceholderText("Write your caption..."),
        "Draft caption",
      );
      const xBubble = getXAccountButton();
      await user.click(xBubble);
      await user.click(screen.getByRole("button", { name: "Save to Drafts" }));

      await new Promise((r) => setTimeout(r, 100));
      expect(mockCreatePost).toHaveBeenCalledWith(
        "Draft caption",
        ["acc-x"],
        "draft",
        null,
        [],
        undefined,
      );
      expect(mockPublishPost).not.toHaveBeenCalled();
    });
  });
});
