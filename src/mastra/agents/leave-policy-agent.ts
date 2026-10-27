import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Agent } from "@mastra/core/agent";
import { exactFallback } from "../processors/policy-guards";
import { ANSWER_OPTIONS, ANSWER_RULES } from "./rules";

// The policy PDF in public/. On Vercel, Gemini fetches it from its public URL
// (public/ isn't in the serverless bundle); locally it's read from disk.
const VERCEL_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const policyPdf = VERCEL_URL
  ? new URL(`https://${VERCEL_URL}/leave-policy.pdf`)
  : readFileSync(join(process.cwd(), "public/leave-policy.pdf"));

// The default agent. The policy PDF is attached to every request as context,
// so the model reads the whole document itself. There's no server-side memory:
// the chat sends the conversation so far with each question.
// leave-policy-rag-agent.ts is the search-based version for larger policy sets.
export const leavePolicyAgent = new Agent({
  id: "leave-policy-agent",
  name: "Leave Policy Assistant",
  model: "google/gemini-3.7-flash",
  instructions: `You answer employee questions about the XYZ Company Leave Policy (HR-POL-004). The policy is the attached PDF. It is the only thing you know.

${ANSWER_RULES}`,
  defaultOptions: {
    ...ANSWER_OPTIONS,
    context: [
      {
        role: "user",
        content: [
          { type: "file", data: policyPdf, mediaType: "application/pdf" },
        ],
      },
    ],
  },
  outputProcessors: [exactFallback],
});
