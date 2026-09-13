import { useRef, useState, type ReactNode } from "react";
import { AutoResurfaceSettingsModal } from "@/components/repost/AutoResurfaceSettingsModal";
import { AutoPlugSettingsModal } from "@/components/autoplug/AutoPlugSettingsModal";
import type {
  AutoResurfaceConfig,
  ConnectedAccountLike,
} from "@/components/repost/AutoResurfacePanel";
import type {
  AutoPlugConfig,
  ConnectedAccount,
} from "@/components/autoplug/AutoPlugPanel";
import type {
  SidebarAutoPlug,
  SidebarAutoRepost,
} from "@/features/dashboard/create/SchedulePostSidebar";

/**
 * Auto-Repost and Auto-Plug wiring for the five post forms.
 *
 * Each form carried an identical copy: two pieces of modal state, two refs
 * holding the config to restore on cancel, the two sidebar toggle objects, and
 * the two modals. Only the configs themselves stay with the form, because the
 * submit handler and the publish overlay read them.
 */
export function useAutoFeatureModals(input: {
  selectedAccountIds: string[];
  accounts: ConnectedAccountLike[];
  use24HourTimeFormat: boolean;
  resurfaceVisible: boolean;
  resurfaceConfig: AutoResurfaceConfig | null;
  setResurfaceConfig: (config: AutoResurfaceConfig | null) => void;
  autoPlugVisible: boolean;
  autoPlugConfig: AutoPlugConfig | null;
  setAutoPlugConfig: (config: AutoPlugConfig | null) => void;
}): {
  autoRepost: SidebarAutoRepost | null;
  autoPlug: SidebarAutoPlug | null;
  modals: ReactNode;
} {
  const {
    resurfaceConfig,
    setResurfaceConfig,
    autoPlugConfig,
    setAutoPlugConfig,
  } = input;

  const [resurfaceModalOpen, setResurfaceModalOpen] = useState(false);
  const [autoplugModalOpen, setAutoplugModalOpen] = useState(false);
  const configBeforeResurfaceRef = useRef<AutoResurfaceConfig | null>(null);
  const configBeforeAutoPlugRef = useRef<AutoPlugConfig | null>(null);

  const openResurface = () => {
    configBeforeResurfaceRef.current = resurfaceConfig;
    setResurfaceModalOpen(true);
  };
  const openAutoPlug = () => {
    configBeforeAutoPlugRef.current = autoPlugConfig;
    setAutoplugModalOpen(true);
  };

  return {
    autoRepost: input.resurfaceVisible
      ? {
          visible: true,
          enabled: !!resurfaceConfig,
          onToggle: () => {
            if (resurfaceConfig) setResurfaceConfig(null);
            else openResurface();
          },
          onOpenSettings: openResurface,
        }
      : null,
    autoPlug: input.autoPlugVisible
      ? {
          visible: true,
          enabled: !!autoPlugConfig,
          onToggle: () => {
            if (autoPlugConfig) setAutoPlugConfig(null);
            else openAutoPlug();
          },
          onOpenSettings: openAutoPlug,
        }
      : null,
    modals: (
      <>
        {resurfaceModalOpen && (
          <AutoResurfaceSettingsModal
            isOpen={true}
            selectedAccountIds={input.selectedAccountIds}
            allAccounts={input.accounts}
            initialConfig={resurfaceConfig}
            onChange={setResurfaceConfig}
            onDone={() => setResurfaceModalOpen(false)}
            onCancel={() => {
              setResurfaceConfig(configBeforeResurfaceRef.current ?? null);
              setResurfaceModalOpen(false);
            }}
            use24HourTimeFormat={input.use24HourTimeFormat}
          />
        )}
        {autoplugModalOpen && (
          <AutoPlugSettingsModal
            isOpen={true}
            selectedAccountIds={input.selectedAccountIds}
            allAccounts={input.accounts as ConnectedAccount[]}
            initialConfig={autoPlugConfig}
            onChange={setAutoPlugConfig}
            onDone={() => setAutoplugModalOpen(false)}
            onCancel={() => {
              setAutoPlugConfig(configBeforeAutoPlugRef.current ?? null);
              setAutoplugModalOpen(false);
            }}
          />
        )}
      </>
    ),
  };
}
