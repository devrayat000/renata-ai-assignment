import { createTool } from "@mastra/core/tools";
import { embed } from "ai";
import { z } from "zod";
import {
  DIMENSION,
  db,
  embedder,
  POLICY_INDEX,
  policyStore,
} from "../rag/store";

const START_SECTIONS = 3; // closest sections by vector search
const HOPS = 1; // how many links to follow from them

// Walk the policy_edges table from the start sections. From a section we go to:
// - what it cites               4.3 -> 8   ("see Section 8")
// - anything that links to it   4.7 -> 6   (6.1 mentions Bereavement Leave)
//                               4.7 -> 4.0 (the summary row for 4.7)
// but not to every leave type a section mentions or summarises, or the
// 4.0 table and 6.3 would pull in half the policy.
// `via` records the link that brought each section in.
const TRAVERSE = `
  WITH RECURSIVE
    links(here, there, label) AS (
      SELECT source, target, source || ' ' || type || ' ' || target
      FROM policy_edges WHERE type = 'cites'
      UNION ALL
      SELECT target, source, source || ' ' || type || ' ' || target
      FROM policy_edges
    ),
    reach(section, depth, via) AS (
      SELECT value, 0, NULL FROM json_each(?)
      UNION
      SELECT links.there, reach.depth + 1, links.label
      FROM reach JOIN links ON links.here = reach.section
      WHERE reach.depth < ?
    )
  SELECT s.section, s.heading, s.text, MIN(r.depth) AS depth, r.via
  FROM reach r JOIN policy_sections s ON s.section = r.section
  GROUP BY s.section
  ORDER BY depth`;

export const policyGraphTool = createTool({
  id: "search-leave-policy",
  description:
    "Search the XYZ Company Leave Policy. Returns the closest sections and the sections they cite or are linked to.",
  inputSchema: z.object({
    query: z.string().describe("What to look up in the policy"),
  }),
  execute: async ({ query }) => {
    const { embedding } = await embed({
      model: embedder,
      value: query,
      providerOptions: {
        google: {
          outputDimensionality: DIMENSION,
          taskType: "RETRIEVAL_QUERY",
        },
      },
    });
    const hits = await policyStore.query({
      indexName: POLICY_INDEX,
      queryVector: embedding,
      topK: START_SECTIONS,
    });
    const scores = new Map(hits.map((h) => [h.metadata?.section, h.score]));

    const { rows } = await db.execute({
      sql: TRAVERSE,
      args: [JSON.stringify([...scores.keys()]), HOPS],
    });

    const sections = rows.map((r) => ({
      section: String(r.section),
      heading: String(r.heading),
      text: String(r.text),
      score: scores.get(String(r.section)) ?? null,
      via: r.via === null ? null : String(r.via),
    }));
    // best matches first, then the linked sections
    sections.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    return { sections };
  },
});
