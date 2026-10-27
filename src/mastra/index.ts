import { Mastra } from "@mastra/core/mastra";
import { leavePolicyAgent } from "./agents/leave-policy-agent";
import { leavePolicyRagAgent } from "./agents/leave-policy-rag-agent";

// No storage: the chat sends the conversation with each question, so nothing
// is kept on the server.
export const mastra = new Mastra({
  agents: { leavePolicyAgent, leavePolicyRagAgent },
});

// The search agent needs the vector index and graph from `bun run ingest`, so
// it's only offered when ENABLE_RAG_AGENT=true.
export const RAG_ENABLED = process.env.ENABLE_RAG_AGENT === "true";
