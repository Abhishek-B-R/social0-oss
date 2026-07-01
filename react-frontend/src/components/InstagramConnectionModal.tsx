
type InstagramConnectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelectDirect: () => void;
  onSelectFacebookPage: () => void;
};

export function InstagramConnectionModal({
  isOpen,
  onClose,
  onSelectDirect,
  onSelectFacebookPage,
}: InstagramConnectionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 p-6 shadow-xl max-w-lg w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Connect Instagram</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Choose how you want to connect your Instagram account:
        </p>
        <div className="space-y-3 mb-6">
          {/* Direct Instagram OAuth */}
          <button
            type="button"
            onClick={onSelectDirect}
            className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/50 dark:border-gray-600 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/50 transition-colors group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Connect via Instagram</h3>
                  <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 rounded-full">
                    Recommended
                  </span>
                </div>
                <p className="text-sm text-gray-600 group-hover:text-gray-800 dark:text-gray-400 dark:group-hover:text-gray-200">
                  Connect directly with your Instagram Business or Creator account. Requires your Instagram account to be linked to a Facebook Page.
                </p>
              </div>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          {/* Facebook Page-based Instagram */}
          <button
            type="button"
            onClick={onSelectFacebookPage}
            className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/50 dark:border-gray-600 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/50 transition-colors group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Connect via Facebook Page</h3>
                </div>
                <p className="text-sm text-gray-600 group-hover:text-gray-800 dark:text-gray-400 dark:group-hover:text-gray-200">
                  Connect through your Facebook Page. If you have multiple Pages with Instagram accounts, you can choose which one to connect.
                </p>
              </div>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
