// PDF -> data/leave-policy.md -> one chunk per section -> embeddings + graph.
// Run before starting the app: bun run ingest

import { readFile, writeFile } from "node:fs/promises";
import { embedMany } from "ai";
import { chunkPolicy } from "../src/mastra/rag/chunk-policy";
import { pdfToMarkdown } from "../src/mastra/rag/pdf-to-markdown";
import { findEdges } from "../src/mastra/rag/policy-graph";
import {
  DIMENSION,
  db,
  embedder,
  POLICY_INDEX,
  policyStore,
} from "../src/mastra/rag/store";

const pdf = await readFile("data/leave-policy.pdf");
const markdown = await pdfToMarkdown(new Uint8Array(pdf));
await writeFile("data/leave-policy.md", markdown);

const sections = await chunkPolicy(markdown);
const edges = findEdges(sections);

// vectors, to find the sections closest to a question
const { embeddings } = await embedMany({
  model: embedder,
  values: sections.map((s) => s.text),
  providerOptions: {
    google: { outputDimensionality: DIMENSION, taskType: "RETRIEVAL_DOCUMENT" },
  },
});

if ((await policyStore.listIndexes()).includes(POLICY_INDEX)) {
  await policyStore.deleteIndex({ indexName: POLICY_INDEX });
}
await policyStore.createIndex({
  indexName: POLICY_INDEX,
  dimension: DIMENSION,
});
await policyStore.upsert({
  indexName: POLICY_INDEX,
  vectors: embeddings,
  metadata: sections,
});

// the graph: sections are the nodes, the policy's own links are the edges
await db.batch(
  [
    "DROP TABLE IF EXISTS policy_edges",
    "DROP TABLE IF EXISTS policy_sections",
    "CREATE TABLE policy_sections (section TEXT PRIMARY KEY, heading TEXT NOT NULL, text TEXT NOT NULL)",
    "CREATE TABLE policy_edges (source TEXT NOT NULL REFERENCES policy_sections, target TEXT NOT NULL REFERENCES policy_sections, type TEXT NOT NULL, PRIMARY KEY (source, target))",
    ...sections.map((s) => ({
      sql: "INSERT INTO policy_sections VALUES (?, ?, ?)",
      args: [s.section, s.heading, s.text],
    })),
    ...edges.map((e) => ({
      sql: "INSERT INTO policy_edges VALUES (?, ?, ?)",
      args: [e.source, e.target, e.type],
    })),
  ],
  "write",
);

console.log(`Indexed ${sections.length} sections and ${edges.length} links:`);
for (const e of edges) console.log(`  ${e.source} ${e.type} ${e.target}`);
