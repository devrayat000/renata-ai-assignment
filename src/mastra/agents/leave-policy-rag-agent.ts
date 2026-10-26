import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { exactFallback, searchFirst } from "../processors/policy-guards";
import { policyGraphTool } from "../tools/policy-graph-tool";
import { ANSWER_OPTIONS, ANSWER_RULES } from "./rules";

// The search-based alternative to leave-policy-agent.ts. Instead of the whole
// policy, the model sees only the sections the searchPolicy tool returns:
// vector matches plus the sections they link to. This is the design for a
// policy set too big for one prompt. It needs `bun run ingest` first.
export const leavePolicyRagAgent = new Agent({
  id: "leave-policy-rag-agent",
  name: "Leave Policy Assistant (search)",
  model: "google/gemini-2.5-flash",
  instructions: `You answer employee questions about the XYZ Company Leave Policy (HR-POL-004).

Always call searchPolicy first. The sections it returns are the only part of the policy you know. Every section starts with its number and heading, e.g. "Section 4.3 - Sick Leave". Besides the closest matches, it returns sections linked to them in the policy (one cites the other, or names its leave type). Use those too when they apply, e.g. 4.3 says to see Section 8. If they don't cover the question, it isn't in the policy.

${ANSWER_RULES}`,
  tools: { searchPolicy: policyGraphTool },
  defaultOptions: ANSWER_OPTIONS,
  memory: new Memory({ options: { lastMessages: 10 } }),
  inputProcessors: [searchFirst],
  outputProcessors: [exactFallback],
});
