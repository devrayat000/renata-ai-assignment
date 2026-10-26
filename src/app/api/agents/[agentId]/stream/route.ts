import { createNextRouteHandler } from "@mastra/next";
import { mastra } from "@/mastra";

// The only Mastra endpoint the app serves. The full Mastra API would let
// anyone list other people's chats or override the agent's instructions.
export const { POST } = createNextRouteHandler({ mastra });
