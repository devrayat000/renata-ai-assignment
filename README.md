# Leave Policy Assistant

A chat assistant that answers employee questions using only the XYZ Company Leave Policy (HR-POL-004, v2.0). It cites the section behind every answer, replies "I don't know, please contact HR." when the policy doesn't cover a question, and refuses to share other employees' leave details.

**Live:** <https://ai.renata.rayat.dev/>

Built with Next.js, Tailwind, [Mastra](https://mastra.ai) and Gemini 3.7 Flash.

## Running it

You need [Bun](https://bun.sh) and a Gemini API key. You can get a free key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
bun install
cp .env.example .env.local   # paste your key into GOOGLE_GENERATIVE_AI_API_KEY
bun dev
```

Open <http://localhost:3000>. Nothing else to set up: chat memory goes in a local SQLite file (`data/mastra.db`) that is created on first use.

The quick tests in the sidebar cover the three requirements: questions the policy answers, questions it doesn't, and requests for a colleague's data.

## Design decision: attach the whole policy

The policy is a 6-page PDF (`public/leave-policy.pdf`) and Gemini reads PDFs directly. So the default agent (`src/mastra/agents/leave-policy-agent.ts`) attaches the PDF to every request, and the model writes the answer and its section citations from it. The PDF is passed as context, so it isn't saved in chat memory. Locally it's read from disk; on Vercel it's sent as its public URL and Gemini fetches it.

- Nothing has to be retrieved, so no relevant section can be missed. This matters for questions that need two sections at once, such as "Thursday to Sunday, how many leave days?" (Sections 4.1 and 5).
- No conversion, vector database, embedding step or ingest.

### The alternative: search + policy graph

For a policy set too big for one prompt (dozens of HR policies), the model can only see the sections a search returns. That version is in the code too: `src/mastra/agents/leave-policy-rag-agent.ts`.

1. `bun run ingest` (`scripts/ingest.ts`) splits the policy (`data/leave-policy.md`, a Markdown copy of the PDF checked by hand) into one chunk per section (`src/mastra/rag/chunk-policy.ts`), embeds each with `gemini-embedding-001`, and stores them in a LibSQL vector index.
2. It also stores the policy's own links between sections as a graph (`src/mastra/rag/policy-graph.ts`): "see Section 8" (`cites`), the 4.0 summary table (`summarises`), and leave types named in other sections (`mentions`).
3. At question time the `searchPolicy` tool (`src/mastra/tools/policy-graph-tool.ts`) takes the 3 closest sections and follows the graph one link away with a recursive SQL query. That's how "my sick leave is used up" also gets Section 8 (Leave Without Pay), which Section 4.3 cites.

To try it, set `ENABLE_RAG_AGENT=true` in `.env.local`, then:

```bash
bun run ingest
bun dev        # a "Full policy / Search" switch appears in the chat header
```

### Comparing them

`bun run eval` runs 25 fixed questions through the default agent; `bun run eval all` runs them through both (run `bun run ingest` first). Each answer is checked against the three requirements, and the results are written to `docs/eval-results.md`.

## How each requirement is enforced

Both agents share the same rules (`src/mastra/agents/rules.ts`) and guards (`src/mastra/processors/policy-guards.ts`).

| Requirement | How |
| --- | --- |
| 1. Answer correctly, cite the policy | Rules: use only the policy, cite a section for every point, add no rules or numbers. Temperature 0, so the same question gets the same answer. |
| 2. Admit when it isn't covered | Rules: reply exactly `I don't know, please contact HR.`, with no guessing or general knowledge. An output processor cuts anything the model adds after that sentence. |
| 3. Protect other employees' data | Rules: refuse with a fixed, polite reply that points to Section 9 and the HR Department. Questions about the user's own records get rule 2, since the assistant has no records. |

The app serves a single API route, `src/app/api/agents/[agentId]/stream/route.ts`. The rest of the Mastra API (listing chat threads, agent settings, running tools) isn't exposed.

## Deploying

The live version runs on Vercel. Because the serverless filesystem is read-only, chat memory goes in a [Turso](https://turso.tech) database. Set these environment variables:

- `GOOGLE_GENERATIVE_AI_API_KEY`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- for the search agent: `ENABLE_RAG_AGENT=true`, and run `bun run ingest` once with the Turso variables set

Vercel sets `VERCEL_PROJECT_PRODUCTION_URL` itself; the agent uses it to build the PDF's public URL. Gemini has to be able to fetch that URL, so turn off Deployment Protection for production.

## Limitations

- Whether a question is about another employee is decided by the model, not by a rule in code.
- The stream route passes the request body to Mastra as it is, so someone calling the API directly (not through the UI) could send their own instructions. It also serves the search agent when `ENABLE_RAG_AGENT` is off, since that flag only hides the switch in the UI.
- Answers take about 10 seconds in production, against about 5 locally.
- The eval checks compliance (right section cited, exact fallback, refusal), not every detail of every answer.
- The search agent needs the policy as Markdown, converted by hand, and its graph links are found with patterns written for this policy ("see Section X", the summary table, leave type names).
