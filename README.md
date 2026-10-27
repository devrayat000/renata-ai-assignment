# Leave Policy Assistant

A chat assistant that answers employee questions using only the XYZ Company Leave Policy (HR-POL-004, v2.0). It cites the section behind every answer, replies "I don't know, please contact HR." when the policy doesn't cover a question, and politely refuses to share other employees' leave details.

**Live:** <https://ai.renata.rayat.dev/>

Built with Next.js, Tailwind, [Mastra](https://mastra.ai) and Gemini (3.7 Flash for the default agent, 2.5 Flash for the search agent).

The policy (`public/leave-policy.pdf`, and `data/leave-policy.md` for the search agent) is the sample document supplied with the assessment. It's included only so the app can run; please don't share it outside the assessment.

## Running it

You need [Bun](https://bun.sh) and your own Gemini API key. You can get a free key from [Google AI Studio](https://aistudio.google.com/apikey). No key is included in this repo.

```bash
bun install
cp .env.example .env.local   # paste your key into GOOGLE_GENERATIVE_AI_API_KEY
bun dev
```

Open <http://localhost:3000>. Nothing else to set up: there's no database for the default agent.

The quick tests in the sidebar cover the three requirements: questions the policy answers, questions it doesn't, and requests for a colleague's data.

## How it works

The policy is a 6-page PDF and Gemini reads PDFs directly, so the default agent (`src/mastra/agents/leave-policy-agent.ts`) attaches the whole PDF to every request. The model writes the answer and its section citations from it.

- Nothing has to be retrieved, so no relevant section can be missed. This matters for questions that need two sections at once, such as "Thursday to Sunday, how many leave days?" (Sections 4.1 and 5).
- No conversion, vector database, embedding step or ingest.

The conversation is kept in the browser and sent with every question (`src/components/chat.tsx`, through Mastra's client), so follow-ups like "And how far in advance do I need to request it?" work without storing anything on the server.

### How each requirement is enforced

Both agents share the same rules (`src/mastra/agents/rules.ts`) and guards (`src/mastra/processors/policy-guards.ts`).

| Requirement | How |
| --- | --- |
| 1. Answer correctly, cite the policy | Use only the policy, cite a section for every point, add no rules or numbers. If a question contains a wrong fact ("since I get 15 sick days…"), correct it from the policy with a citation. Plain-text replies, temperature 0. |
| 2. Admit when it isn't covered | Reply exactly `I don't know, please contact HR.`, with no guessing or general knowledge. If only part of a question is covered, answer that part and end with the same sentence. An output processor cuts anything the model adds after the sentence when the reply starts with it. |
| 3. Protect other employees' data | Refuse with a fixed, polite reply that points to Section 9 and the HR Department. Questions about the user's own records get rule 2, since the assistant has no records. |

The app serves a single API route, `src/app/api/agents/[agentId]/stream/route.ts`. It accepts only the enabled agents and passes on only the conversation's user and assistant text, so a caller can't send their own instructions, system messages or model settings. The rest of the Mastra API isn't exposed.

### Testing

`bun run eval` runs 25 fixed questions (15 in the policy, 7 not covered, 3 about colleagues) and checks each answer against the three requirements. Results are written to [`docs/eval-results.md`](docs/eval-results.md). In the last run both agents passed 25/25.

## The alternative: search + policy graph

For a policy set too big for one prompt (dozens of HR policies), the model can only see the sections a search returns. That version is in the code too: `src/mastra/agents/leave-policy-rag-agent.ts`.

1. `bun run ingest` (`scripts/ingest.ts`) splits the policy (`data/leave-policy.md`, a Markdown copy of the PDF checked by hand) into one chunk per section (`src/mastra/rag/chunk-policy.ts`), embeds each with `gemini-embedding-001`, and stores them in a LibSQL vector index.
2. It also stores the policy's own links between sections as a graph (`src/mastra/rag/policy-graph.ts`): "see Section 8" (`cites`), the 4.0 summary table (`summarises`), and leave types named in other sections (`mentions`).
3. At question time the `searchPolicy` tool (`src/mastra/tools/policy-graph-tool.ts`) takes the 3 closest sections and follows the graph one link away with a recursive SQL query. That's how "my sick leave is used up" also gets Section 8 (Leave Without Pay), which Section 4.3 cites.

To try it locally, set `ENABLE_RAG_AGENT=true` in `.env.local`, then:

```bash
bun run ingest
bun dev        # a "Full policy / Search" switch appears in the chat header
```

The vectors and graph go in `data/mastra.db`, or in [Turso](https://turso.tech) when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set. On Vercel the search agent needs Turso, since the filesystem there is read-only. `bun run eval all` runs the 25 questions through both agents.

## Deploying (Vercel)

The only required environment variable is `GOOGLE_GENERATIVE_AI_API_KEY`.

### The policy PDF's public URL

The file must be at `public/leave-policy.pdf`. Next.js serves everything in `public/` at the site root, so its public URL is `https://<your-domain>/leave-policy.pdf`. To use a different policy, replace the file and keep the name.

- **Locally, or on any server that keeps `public/` next to the app:** the agent reads the file from disk. Nothing to set up.
- **On Vercel:** serverless functions don't include `public/`, so the agent sends Gemini the PDF's URL instead and Gemini downloads it. The URL is built from `VERCEL_PROJECT_PRODUCTION_URL`, which Vercel sets automatically to the production domain (your custom domain if you added one, otherwise the `.vercel.app` one).

For that to work, Gemini must be able to download the file:

1. Turn off Deployment Protection for production (Project → Settings → Deployment Protection). Otherwise the URL returns a login page instead of the PDF.
2. After deploying, open `https://<your-domain>/leave-policy.pdf` in a private browser window. It should show the PDF without asking you to log in.

## Limitations

- Whether a question is about another employee is decided by the model, not by a rule in code.
- It isn't connected to any HR system, so it knows nothing about individual employees. "What's my leave balance?" gets "I don't know, please contact HR."
- Answers usually take about 5 seconds in production, but occasionally 20–40 seconds.
- The eval checks compliance (right section cited, exact fallback, refusal), not every detail of every answer.
- The search agent needs the policy as Markdown, converted by hand, and its graph links are found with patterns written for this policy ("see Section X", the summary table, leave type names).
