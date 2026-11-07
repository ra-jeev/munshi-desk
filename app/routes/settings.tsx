import { useT } from "@agent-native/core/client/i18n";
import { TeamPage } from "@agent-native/toolkit/app/org";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import {
  AccountSettingsCard,
  SettingsTabsPage,
  useAgentSettingsTabs,
} from "@agent-native/toolkit/app/settings";

import { FactorySettings } from "@/components/factory/FactorySettings";
import { APP_TITLE } from "@/lib/app-config";

import { munshiRoles } from "../../server/lib/munshi-roles";

import changelog from "../../CHANGELOG.md?raw";

export function meta() {
  return [{ title: `Settings - ${APP_TITLE}` }]; // i18n-ignore server meta fallback; client title is localized via useSetPageTitle
}

// Chat has no app rows here: core Preferences owns the interface language.
export default function SettingsRoute() {
  const t = useT();
  // Stage 2 roles: the Organization tab gets the Munshi role column
  // (owner/operator) so the owner can invite operators and assign roles.
  const agentSettingsTabs = useAgentSettingsTabs({
    organizationContent: <TeamPage appRoles={munshiRoles} showTitle={false} />,
  });
  useSetPageTitle(t("settings.title"));

  return (
    <SettingsTabsPage
      account={<AccountSettingsCard />}
      extraTabs={agentSettingsTabs}
      appAreas={[
        {
          id: "factory",
          label: t("factory.tabLabel"),
          content: <FactorySettings />,
          keywords: "machines shifts holidays rates",
        },
      ]}
      whatsNewMarkdown={changelog}
    />
  );
}
