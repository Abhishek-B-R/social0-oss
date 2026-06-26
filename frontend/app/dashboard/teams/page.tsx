import { redirect } from "next/navigation";

// Teams page disabled until the feature is ready - restore below when shipping.
// import DocsInfoIcon from "@/components/info-icon";
// import { DOCS_TEAMS_URL } from "@/lib/docs-url";
//
// export default function TeamsPage() {
//   return (
//     <div>
//       <div className="flex items-center gap-2">
//         <h1 className="text-3xl font-semibold font-serif tracking-tight text-foreground mb-2 landing flex items-center gap-2">
//           Teams
//         </h1>
//         <DocsInfoIcon url={DOCS_TEAMS_URL} />
//       </div>
//       <p className="mt-2 text-text-muted">
//         Coming soon. Invite team members and manage access.
//       </p>
//     </div>
//   );
// }

export default function TeamsPage() {
  redirect("/dashboard/more");
}
