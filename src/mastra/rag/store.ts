import { google } from "@ai-sdk/google";
import { createClient } from "@libsql/client";
import { LibSQLVector } from "@mastra/libsql";

// One SQLite file for everything: policy vectors, the policy graph
// (policy_sections + policy_edges tables) and chat memory.
export const DB_URL = process.env.TURSO_DATABASE_URL ?? "file:./data/mastra.db";
const AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

export const POLICY_INDEX = "leave_policy";
export const DIMENSION = 768;

export const db = createClient({ url: DB_URL, authToken: AUTH_TOKEN });
export const policyStore = new LibSQLVector({
  id: "policy-store",
  url: DB_URL,
});
export const embedder = google.embedding("gemini-embedding-001");
