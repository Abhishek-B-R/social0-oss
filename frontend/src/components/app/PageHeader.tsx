import { isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  /**
   * One line under the title, only when it carries state
   * ("1 post going out today · 3 scheduled"). No descriptions of the page.
   */
  subtitle?: ReactNode;
  /** Right side: one filled primary at most. Wraps under the title on phones. */
  actions?: ReactNode;
  /**
   * Detail and sub-pages only: the way back ("Posts › Failed",
   * "← Automations"). Never a label that repeats the section name.
   */
  breadcrumb?: ReactNode;
  /**
   * @deprecated Use `breadcrumb`. A plain string here ("Calendar",
   * "Settings") only repeated the title and is no longer rendered; an
   * element (a real breadcrumb) still renders as `breadcrumb`.
   */
  eyebrow?: ReactNode;
  /** Row under the header: tabs, filters. */
  children?: ReactNode;
  className?: string;
};

/**
 * Page title block. DM Sans 600 via `.dash-page-title`. Renders the page's
 * only <h1>. Always 24px above the content (see `PageContainer`).
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  eyebrow,
  children,
  className,
}: PageHeaderProps) {
  const crumb = breadcrumb ?? (isValidElement(eyebrow) ? eyebrow : null);
  return (
    <header className={cn("mb-6", className)}>
      {crumb ? <div className="mb-2 text-[13px] text-text-muted">{crumb}</div> : null}
      {/* With a subtitle, actions line up with the title row instead of
          floating halfway down the title + subtitle block. */}
      <div
        className={cn(
          "flex flex-wrap justify-between gap-x-4 gap-y-3",
          subtitle ? "items-start" : "items-center",
        )}
      >
        {/* Grow, but from an 8rem basis rather than `flex-1`'s 0%: with a
            zero basis the title never forced the actions onto their own line,
            so on a phone wide actions (Home's status counts) squeezed the
            title to one letter per line. */}
        <div className="min-w-0 flex-[1_1_8rem]">
          <h1 className="dash-page-title">{title}</h1>
          {subtitle ? <p className="dash-page-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? (
          // Shrinkable (no shrink-0) and capped at the column width: a
          // shrink-0 flex item always keeps its max-content width, so on a
          // phone wide action sets never wrapped and scrolled the page
          // sideways instead.
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </header>
  );
}
