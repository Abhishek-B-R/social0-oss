import { DOCS_TEAMS_URL } from "@/lib/docs-url";
import { MdQuestionMark } from "react-icons/md";

export default function TeamsPage() {
  return (
    <div>
      <a
        href={DOCS_TEAMS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-0 right-4 sm:right-6 lg:right-10 z-10 rounded-full p-1.5 text-text-muted hover:text-text hover:bg-muted transition-colors flex gap-2 items-center"
        title="Documentation for this page"
        aria-label="Documentation for this page"
      >
        <MdQuestionMark className="h-4 w-4" />
      </a>
      <h1 className="text-2xl font-extrabold text-text">Teams</h1>
      <p className="mt-2 text-text-muted">
        Coming soon. Invite team members and manage access.
      </p>
    </div>
  );
}
