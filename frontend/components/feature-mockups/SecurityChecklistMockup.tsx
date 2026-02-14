"use client";

const ITEMS = [
  { label: "Tokens encrypted at rest", done: true },
  { label: "Minimal OAuth scopes", done: true },
  { label: "Disconnect anytime", done: true },
];

export function SecurityChecklistMockup() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-xl p-5 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
          <svg
            className="w-4 h-4 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <span className="text-sm font-semibold text-gray-900">Security</span>
      </div>
      <ul className="space-y-2">
        {ITEMS.map((item) => (
          <li
            key={item.label}
            className="flex items-center gap-2 text-sm text-gray-700"
          >
            <span className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
              <svg
                className="w-3 h-3 text-emerald-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
