import { createGetDb } from "@agent-native/core/db";
import { registerIdentityColumns } from "@agent-native/core/org";

import * as schema from "./schema.ts";

// Stage 2 (Task 3): the operator machine link is an access grant keyed by
// member email. It follows the person across an email change (rekey) and
// ends with the membership (delete on offboard) — see the storing-data
// skill's identity-columns policy.
registerIdentityColumns([
  {
    table: "munshi_operator_machines",
    column: "operator_email",
    emailChange: "rekey",
    offboard: "delete",
    reason:
      "Switching the operator's machine needs the link to follow their email change; removing the member must end the grant.",
  },
  {
    table: "munshi_operator_alerts",
    column: "operator_email",
    emailChange: "rekey",
    offboard: "delete",
    reason:
      "Alerts report who reported what, so they must follow the reporter's email change; removing the member ends their alerts.",
  },
]);
export const getDb = createGetDb(schema);
export { schema };
