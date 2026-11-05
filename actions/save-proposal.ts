import { defineAction } from "@agent-native/core/action";

import { writeSchema } from "../server/lib/contracts.ts";
import { orgFor, commit } from "../server/lib/factory.ts";
export default defineAction({
  description:
    "Save exactly the previewed proposal after owner approval. Requires its schedule revision and a fresh UUID requestId. Unchanged retries reuse that UUID. A stale revision returns 409; preview again and ask for approval again.",
  schema: writeSchema,
  needsApproval: true,
  allowPersistentApproval: false,
  run: async (args, ctx) => commit(orgFor(ctx), args),
});
