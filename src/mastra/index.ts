import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { leavePolicyAgent } from "./agents/leave-policy-agent";
import { leavePolicyRagAgent } from "./agents/leave-policy-rag-agent";
import { AUTH_TOKEN, DB_URL } from "./rag/store";

export const mastra = new Mastra({
  agents: { leavePolicyAgent, leavePolicyRagAgent },
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: DB_URL,
    authToken: AUTH_TOKEN,
  }),
});

// The search agent needs the vector index and graph from `bun run ingest`, so
// it's only offered when ENABLE_RAG_AGENT=true.
export const RAG_ENABLED = process.env.ENABLE_RAG_AGENT === "true";
