import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { leavePolicyAgent } from "./agents/leave-policy-agent";
import { DB_URL, policyStore } from "./rag/store";

export const mastra = new Mastra({
  agents: { leavePolicyAgent },
  vectors: { policyStore },
  storage: new LibSQLStore({ id: "mastra-storage", url: DB_URL }),
});
