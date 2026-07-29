-- Workspace icon key (Phosphor id), used in switcher / board UI.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT 'briefcase';
