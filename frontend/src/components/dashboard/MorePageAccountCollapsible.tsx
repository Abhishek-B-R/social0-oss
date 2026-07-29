import { SidebarAccountMenu } from "@/components/dashboard/SidebarAccountMenu";

type MorePageAccountCollapsibleProps = {
  image: string | null | undefined;
  name: string | null | undefined;
  email: string | null | undefined;
  planLabel: string;
};

/** Mobile More page account trigger — same panel as the desktop sidebar menu. */
export function MorePageAccountCollapsible({
  image,
  name,
  email,
  planLabel,
}: MorePageAccountCollapsibleProps) {
  return (
    <section className="relative z-20 mb-6 mt-6">
      <SidebarAccountMenu
        variant="page"
        planLabel={planLabel}
        user={{ image, name, email }}
      />
    </section>
  );
}
