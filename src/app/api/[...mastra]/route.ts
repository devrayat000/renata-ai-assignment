import { createNextRouteHandler } from "@mastra/next";
import { mastra } from "@/mastra";

export const { GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD } =
  createNextRouteHandler({ mastra });
