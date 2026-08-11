import { createPortal } from "react-dom";

type InstagramConnectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelectDirect: () => void;
  onSelectFacebookPage: () => void;
};

const backdropClass =
  "fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-md";

export function InstagramConnectionModal({
  isOpen,
  onClose,
  onSelectDirect,
  onSelectFacebookPage,
}: InstagramConnectionModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div className={backdropClass} role="presentation" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instagram-connect-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="instagram-connect-title"
            className="text-xl font-bold text-gray-900 dark:text-gray-100"
          >
            Connect Instagram
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          Choose how you want to connect your Instagram account:
        </p>
        <div className="mb-6 space-y-3">
          <button
            type="button"
            onClick={onSelectDirect}
            className="group w-full rounded-xl border-2 border-gray-200 p-4 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/50 dark:border-gray-600 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Connect via Instagram
                  </h3>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                    Recommended
                  </span>
                </div>
                <p className="text-sm text-gray-600 group-hover:text-gray-800 dark:text-gray-400 dark:group-hover:text-gray-200">
                  Connect directly with your Instagram Business or Creator
                  account. Requires your Instagram account to be linked to a
                  Facebook Page.
                </p>
              </div>
              <svg
                className="mt-0.5 h-5 w-5 shrink-0 text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </button>

          <button
            type="button"
            onClick={onSelectFacebookPage}
            className="group w-full rounded-xl border-2 border-gray-200 p-4 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50/50 dark:border-gray-600 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Connect via Facebook Page
                  </h3>
                </div>
                <p className="text-sm text-gray-600 group-hover:text-gray-800 dark:text-gray-400 dark:group-hover:text-gray-200">
                  Connect through your Facebook Page. If you have multiple Pages
                  with Instagram accounts, you can choose which one to connect.
                </p>
              </div>
              <svg
                className="mt-0.5 h-5 w-5 shrink-0 text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
