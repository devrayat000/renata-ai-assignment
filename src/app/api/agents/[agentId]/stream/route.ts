import { createNextRouteHandler } from "@mastra/next";
import { mastra, RAG_ENABLED } from "@/mastra";

// The only Mastra endpoint the app serves. The full Mastra API would let
// anyone override the agent's instructions or run its tools.
const mastraApi = createNextRouteHandler({ mastra });

const AGENTS = [
  "leave-policy-agent",
  ...(RAG_ENABLED ? ["leave-policy-rag-agent"] : []),
];
const MAX_MESSAGES = 20; // the latest turns of the conversation
const MAX_LENGTH = 4000; // characters per message

export async function POST(
  req: Request,
  { params }: RouteContext<"/api/agents/[agentId]/stream">,
) {
  const { agentId } = await params;
  if (!AGENTS.includes(agentId)) return new Response(null, { status: 404 });

  // The chat sends the conversation so far. Keep only user and assistant text,
  // so instructions, tools, system messages or model settings sent by a
  // caller are dropped.
  const { messages } = await req.json();
  const conversation = (Array.isArray(messages) ? messages : [])
    .filter((m) => m?.role === "user" || m?.role === "assistant")
    .map((m) => ({ role: m.role, content: textOf(m.content) }))
    .filter((m) => m.content)
    .slice(-MAX_MESSAGES);
  if (conversation.at(-1)?.role !== "user") {
    return new Response(null, { status: 400 });
  }

  return mastraApi.POST(
    new Request(req.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: conversation }),
      signal: req.signal,
    }),
  );
}

// A message's text, whether it was sent as a string or as text parts.
function textOf(content: unknown): string {
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((p) => (p?.type === "text" ? String(p.text) : ""))
            .join("")
        : "";
  return text.trim().slice(0, MAX_LENGTH);
}
