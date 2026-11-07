// Client-safe role vocabulary for Munshi Desk. This module stays free of
// server imports so TeamPage can use the same descriptor the server
// registers with defineAppRoles() (see server/lib/access.ts).
export const munshiRoles = {
  appId: "munshi-desk",
  roles: ["owner", "operator"] as const,
  // Display only (e.g. TeamPage column for unassigned members). It does NOT
  // grant any permission; authorization always needs an explicit assignment
  // or the org-admin rule in server/lib/access.ts.
  defaultRole: "operator",
  label: "Munshi role",
  roleLabels: {
    owner: "Owner",
    operator: "Operator",
  },
  permissions: {
    "factory.owner": ["owner"],
  },
} as const;

export type MunshiRole = (typeof munshiRoles.roles)[number];
