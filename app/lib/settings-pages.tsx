import { OrgMembersPage } from "@agent-native/toolkit/app/org";
import {
  CORE_SETTINGS_PAGES,
  registerSettingsPages,
  type SettingsPageContext,
  type SettingsPageDefinition,
} from "@agent-native/toolkit/app/settings";

import { FactorySettings } from "@/components/factory/FactorySettings";

import { munshiRoles } from "../../server/lib/munshi-roles";

// Small-factory Settings: everyone gets Profile, Preferences, Security.
// Owners also get Factory (App > General) and Members. Every other page is
// hidden. Presentation only: server actions still enforce roles.

export type MunshiRole = "owner" | "operator";

const ACCOUNT_PAGES = new Set(["profile", "preferences", "security"]);
const OWNER_PAGES = new Set(["app", "members"]);

// null while get-my-role is loading: viewers see only the account pages.
let currentRole: MunshiRole | null = null;

function isOwnerView(context: SettingsPageContext): boolean {
  return (
    currentRole === "owner" || (currentRole !== null && context.isAdmin)
  );
}

function pageDefinitions(): SettingsPageDefinition[] {
  return CORE_SETTINGS_PAGES.map((page) => {
    if (ACCOUNT_PAGES.has(page.id)) return page;
    if (OWNER_PAGES.has(page.id)) {
      return {
        ...page,
        visible: (context: SettingsPageContext) => isOwnerView(context),
        ...(page.id === "members"
          ? {
              component: () => <OrgMembersPage appRoles={munshiRoles} />,
            }
          : {
              // App > General holds only Factory: no model or demo rows.
              labelKey: "factory.tabLabel",
              component: () => <FactorySettings />,
            }),
      };
    }
    return { ...page, visible: () => false };
  });
}

registerSettingsPages(pageDefinitions());

/** Call when get-my-role resolves; re-registering makes the shell re-filter. */
export function setMunshiRole(role: MunshiRole | null): void {
  if (role === currentRole) return;
  currentRole = role;
  registerSettingsPages(pageDefinitions());
}
