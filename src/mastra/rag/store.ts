import { google } from "@ai-sdk/google";
import { createClient } from "@libsql/client";
import { LibSQLVector } from "@mastra/libsql";

// One database for everything: chat memory, and for the search agent the
// policy vectors and graph (policy_sections + policy_edges tables).
// A local SQLite file, or Turso when TURSO_DATABASE_URL is set.
export const DB_URL = process.env.TURSO_DATABASE_URL || "file:./data/mastra.db";
export const AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || undefined;

export const POLICY_INDEX = "leave_policy";
export const DIMENSION = 768;

export const db = createClient({ url: DB_URL, authToken: AUTH_TOKEN });
export const policyStore = new LibSQLVector({
  id: "policy-store",
  url: DB_URL,
  authToken: AUTH_TOKEN,
});
export const embedder = google.embedding("gemini-embedding-001");
