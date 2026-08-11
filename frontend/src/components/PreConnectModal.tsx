import { createPortal } from "react-dom";

type PreConnectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  title: string;
  checkmark: string;
  info: string;
};

/** Full-viewport dim + blur — must portal out of transformed parents (e.g. framer-motion). */
const backdropClass =
  "fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-md";

export function PreConnectModal({
  isOpen,
  onClose,
  onContinue,
  title,
  checkmark,
  info,
}: PreConnectModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div
      className={backdropClass}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preconnect-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="preconnect-title"
            className="text-xl font-bold text-gray-900 dark:text-gray-100"
          >
            {title}
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
        <div className="mb-4 flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs text-white">
            ✓
          </span>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {checkmark}
          </p>
        </div>
        <p className="mb-6 whitespace-pre-line text-sm text-gray-600 dark:text-gray-400">
          {info}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700"
          >
            Continue
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
