# Leave Policy Assistant

A chat app that answers employee questions using only the XYZ Company Leave Policy (`data/leave-policy.pdf`).

Built with Next.js, Tailwind, Mastra (`@mastra/core`, `@mastra/rag`, `@mastra/react`) and Gemini. Everything is stored in one local SQLite file (`data/mastra.db`), so there is no database to set up.

## Running it

You need [Bun](https://bun.sh) and a Gemini API key. You can get a free key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
bun install
cp .env.example .env   # paste your key into GOOGLE_GENERATIVE_AI_API_KEY
bun run ingest         # PDF -> Markdown -> sections -> embeddings + graph
bun dev
```

Open <http://localhost:3000>.

## How it works

### Ingest (`scripts/ingest.ts`, run once before starting the app)

1. The PDF is converted to `data/leave-policy.md` (`src/mastra/rag/pdf-to-markdown.ts`). Section titles become headings, and the three tables are rebuilt as Markdown tables.
2. `MDocument` splits the Markdown on its headings, which gives one chunk per policy section, 20 in all (`src/mastra/rag/chunk-policy.ts`). Each chunk starts with `Section 4.3 - Sick Leave` so the model can cite it.
3. The sections are embedded with `gemini-embedding-001` and stored in a LibSQL vector index.
4. The policy's own links between sections are read from the text (`src/mastra/rag/policy-graph.ts`) and stored as a graph in two tables, `policy_sections` (nodes) and `policy_edges` (edges). There are 23 edges of three types:
   - `cites`: "(see Section 8)" in the text, e.g. 4.3 cites 8 and 3 cites 4.1.
   - `summarises`: the Section column of the 4.0 summary table, e.g. 4.0 summarises 4.7.
   - `mentions`: a section names a leave type defined in 4.1 to 4.8, e.g. 6.3 says a manager "may not refuse Sick Leave", so 6 mentions 4.3.

### Chat

- The agent (`src/mastra/agents/leave-policy-agent.ts`) has one tool, `searchPolicy` (`src/mastra/tools/policy-graph-tool.ts`).
  1. Vector search finds the 3 sections closest to the question.
  2. A recursive SQL query (`WITH RECURSIVE`) follows the graph from them one link away. It follows what a section cites, and anything that links to it. That's how "my sick leave is used up" gets Section 8 (Leave Without Pay), which 4.3 cites, and "can my manager refuse my sick leave?" gets Section 6, which mentions Sick Leave.
  3. It doesn't follow every leave type a section mentions or summarises, or the 4.0 table and Section 6 would pull in half the policy.

  Each section the tool returns says why it is there: a vector match score, or the link that brought it in (`4.3 cites 8`). Results are the same every time for the same question.
- `@mastra/next` serves the Mastra API under `/api`. The UI streams replies with `useChat` from `@mastra/react`. Chat memory keeps the last 10 messages.
- Two processors (`src/mastra/processors/policy-guards.ts`) back up the agent's instructions. One makes the agent search the policy before answering. The other cuts anything the model adds after `I don't know, please contact HR.`, so that reply is always exactly that string.

The UI shows a badge for each section cited in the answer, the graph nodes the tool returned and why, and one-click questions for the three cases: an in-policy question, a question the policy doesn't cover, and a request for a colleague's data. The "not covered" and "confidential" replies are labelled so they're easy to tell apart. The Renata PLC logos in `public/brand/` were cut from the assessment PDF.

## Limitations

- Links are found with patterns written for this policy: "see Section X", the summary table, and leave type names. A policy that refers to sections in other ways ("as described above") would need more patterns.
- The PDF converter is written for this policy's layout.
- Whether a question is about a colleague is decided by the model.
