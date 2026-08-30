import {
  WORKSPACE_ROLES,
  WORKSPACE_ROLE_META,
  type WorkspaceRole,
} from "@/lib/workspace-roles";
import { CaretDown } from "@/icons/phosphor";
import { cn } from "@/lib/utils";

export function WorkspaceRoleSelect({
  value,
  onChange,
  disabled,
  className,
  id,
  "aria-label": ariaLabel,
}: {
  value: WorkspaceRole;
  onChange: (role: WorkspaceRole) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value as WorkspaceRole)}
        className="h-9 w-full appearance-none rounded-xl border border-input bg-bg px-3 pr-8 text-sm leading-none text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
      >
        {WORKSPACE_ROLES.map((role) => (
          <option key={role} value={role} title={WORKSPACE_ROLE_META[role].description}>
            {WORKSPACE_ROLE_META[role].label}
          </option>
        ))}
      </select>
      <CaretDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
    </div>
  );
}
