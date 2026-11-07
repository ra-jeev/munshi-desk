import { defineAppRoles } from "@agent-native/core/org-team";

import { munshiRoles } from "./munshi-roles.ts";

// Stage 2 roles (docs/CROUTON-TASKS.md Task 3).
//
// The org creator is the owner: a new organization gives its creator the
// org role "owner", but app roles are a separate explicit assignment. The
// allowOrgAdmins policy lets an active org owner/admin pass the owner
// permission without an app-role row, so existing orgs (and the CLI dev
// identity's auto-created org) keep working with no backfill. Members
// invited as operators are assigned the "operator" app role via TeamPage;
// they never hold "factory.owner", so ownerGuard denies them with 403 on
// every surface (screens, agent, HTTP, CLI).
//
// TODO (Task 4): operator actions (my-jobs, report-progress,
// report-machine-off) live beside the factory actions and must NOT use this
// guard; they check the caller's machine link instead.
export const munshiAccess = defineAppRoles(munshiRoles, {
  allowOrgAdmins: true,
});

// Owner-only guard for every factory action. Works for the screens, the
// agent, HTTP and the CLI because `authorize` wraps run() on all paths.
export const ownerGuard = munshiAccess.requirePermission("factory.owner");
