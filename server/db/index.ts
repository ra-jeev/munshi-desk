import { createGetDb } from "@agent-native/core/db";

import * as schema from "./schema.ts";
export const getDb = createGetDb(schema);
export { schema };
