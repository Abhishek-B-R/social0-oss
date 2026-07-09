type InfoIconProps = { url: string; className?: string };

export default function DocsInfoIcon({ url, className }: InfoIconProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        `rounded-full -mt-2 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center` +
        className
      }
      title="Documentation for this page"
      aria-label="Documentation for this page"
    >
      <span className="sr-only">Documentation</span>
      <svg
        className="w-4 h-4"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
          clipRule="evenodd"
        />
      </svg>
    </a>
  );
}
