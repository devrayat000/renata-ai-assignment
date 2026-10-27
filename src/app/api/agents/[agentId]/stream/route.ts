import { createNextRouteHandler } from "@mastra/next";
import { mastra, RAG_ENABLED } from "@/mastra";

// The only Mastra endpoint the app serves. The full Mastra API would let
// anyone list other people's chats or override the agent's instructions.
const mastraApi = createNextRouteHandler({ mastra });

const AGENTS = [
  "leave-policy-agent",
  ...(RAG_ENABLED ? ["leave-policy-rag-agent"] : []),
];

export async function POST(
  req: Request,
  { params }: RouteContext<"/api/agents/[agentId]/stream">,
) {
  const { agentId } = await params;
  if (!AGENTS.includes(agentId)) return new Response(null, { status: 404 });

  // Pass on only the user's messages and the thread, so instructions, tools,
  // system messages or model settings sent by a caller are dropped.
  const { messages, memory, runId } = await req.json();
  const body = {
    messages: (Array.isArray(messages) ? messages : []).filter(
      (m: { role?: string }) => m?.role === "user",
    ),
    memory: { thread: memory?.thread, resource: agentId },
    runId,
    untilIdle: true,
  };
  return mastraApi.POST(
    new Request(req.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: req.signal,
    }),
  );
}
