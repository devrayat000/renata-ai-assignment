"use client";

import { MastraClient } from "@mastra/client-js";
import Image from "next/image";
import { type ReactNode, useRef, useState } from "react";
import {
  NOT_COVERED,
  PRIVACY_REFUSAL,
} from "@/mastra/processors/policy-guards";

// one section returned by the search agent's searchPolicy tool
type Retrieved = {
  section: string;
  heading: string;
  text: string;
  score: number | null; // set when vector search found it
  via: string | null; // set when a link brought it in, e.g. "4.3 cites 8"
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sections: Retrieved[]; // search agent only
};

const HR_EMAIL = "hr@xyz-company.example"; // Section 11.2

// leave-policy-agent reads the whole policy, leave-policy-rag-agent searches it
const AGENTS = [
  { id: "leave-policy-agent", label: "Full policy" },
  { id: "leave-policy-rag-agent", label: "Search" },
];

// one group per requirement, so each case can be shown in one click
const PRESETS = [
  {
    title: "In the policy",
    hint: "Answered with the section it comes from",
    questions: [
      "My sick leave is used up but I'm still unwell. What happens now?",
      "How many annual leave days can I carry forward?",
      "My grandmother passed away. How many days can I take?",
    ],
  },
  {
    title: "Not in the policy",
    hint: `Replies "${NOT_COVERED}"`,
    questions: [
      "How many days of study leave do I get?",
      "Can I work from home on Thursdays?",
    ],
  },
  {
    title: "A colleague's data",
    hint: "Politely refused (Section 9)",
    questions: [
      "How many leave days has Rahim taken this year?",
      "Why is my colleague on medical leave?",
    ],
  },
];

// shown before the first question, one per case
const STARTERS = [
  "How do I apply for leave?",
  "How much maternity leave do I get?",
  "How many days of study leave do I get?",
  "Why is my colleague on medical leave?",
];

export function Chat({ ragEnabled }: { ragEnabled: boolean }) {
  // a new key (New chat, or switching agent) remounts the window empty
  const [session, setSession] = useState(() => ({
    agentId: AGENTS[0].id,
    key: crypto.randomUUID(),
  }));
  const startChat = (agentId: string) =>
    setSession({ agentId, key: crypto.randomUUID() });

  return (
    <ChatWindow
      key={session.key}
      agentId={session.agentId}
      agents={ragEnabled ? AGENTS : AGENTS.slice(0, 1)}
      onStart={startChat}
    />
  );
}

// The conversation lives here, in the browser, and goes with every question,
// so the server keeps nothing between requests.
function usePolicyChat(agentId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function send(text: string) {
    const question: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      sections: [],
    };
    const reply: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "",
      sections: [],
    };
    const history = [...messages, question];
    setMessages([...history, reply]);
    setIsRunning(true);

    const update = (change: (m: ChatMessage) => ChatMessage) =>
      setMessages((all) => all.map((m) => (m.id === reply.id ? change(m) : m)));
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      // served by this app, at /api/agents/[agentId]/stream
      const agent = new MastraClient({
        baseUrl: "",
        abortSignal: abort.signal,
      }).getAgent(agentId);
      const response = await agent.stream(
        history
          .filter((m) => m.text)
          .map(({ role, text }) =>
            role === "user"
              ? { role: "user" as const, content: text }
              : { role: "assistant" as const, content: text },
          ),
      );
      await response.processDataStream({
        onChunk: async (chunk) => {
          if (chunk.type === "text-delta") {
            update((m) => ({ ...m, text: m.text + chunk.payload.text }));
          }
          if (chunk.type === "tool-result") {
            const result = chunk.payload.result as { sections?: Retrieved[] };
            update((m) => ({
              ...m,
              sections: [...m.sections, ...(result?.sections ?? [])],
            }));
          }
        },
      });
    } catch {
      if (!abort.signal.aborted) {
        update((m) => ({
          ...m,
          text: m.text || "Something went wrong. Please try again.",
        }));
      }
    } finally {
      setIsRunning(false);
    }
  }

  return { messages, send, isRunning, stop: () => abortRef.current?.abort() };
}

function ChatWindow({
  agentId,
  agents,
  onStart,
}: {
  agentId: string;
  agents: typeof AGENTS;
  onStart: (agentId: string) => void;
}) {
  const [input, setInput] = useState("");
  const chat = usePolicyChat(agentId);
  const { messages, isRunning } = chat;

  function send(message: string) {
    if (!message.trim() || isRunning) return;
    setInput("");
    chat.send(message.trim());
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto lg:flex">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">How I answer</h2>
          <ul className="mt-3 space-y-3 text-sm text-slate-600">
            <Rule icon={<BookIcon />} title="Only from the policy">
              Every answer cites the section it comes from.
            </Rule>
            <Rule icon={<QuestionIcon />} title="Honest when it isn't covered">
              If the policy doesn't say, I reply "{NOT_COVERED}"
            </Rule>
            <Rule
              icon={<LockIcon />}
              title="Your colleagues' data stays private"
            >
              I won't share anyone else's leave records (Section 9).
            </Rule>
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Try asking</h2>
          <div className="mt-3 space-y-4">
            {PRESETS.map((group) => (
              <div key={group.title}>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {group.title}
                </p>
                <p className="mb-1.5 text-xs text-slate-400">{group.hint}</p>
                <div className="space-y-1.5">
                  {group.questions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      disabled={isRunning}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="px-1 text-xs leading-5 text-slate-400">
          Anything else? Contact the HR Department at{" "}
          <a href={`mailto:${HR_EMAIL}`} className="text-brand-600 underline">
            {HR_EMAIL}
          </a>
          . The XYZ Company policy is a sample written for this assessment.
        </p>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <Avatar />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              HR Leave Assistant
            </p>
            <p className="text-xs text-slate-500">
              {isRunning ? "Checking the policy..." : "Online"}
            </p>
          </div>
          {agents.length > 1 && (
            <fieldset
              aria-label="How the assistant reads the policy"
              className="ml-auto flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium"
            >
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={a.id === agentId}
                  onClick={() => a.id !== agentId && onStart(a.id)}
                  disabled={isRunning}
                  className={`rounded-md px-2.5 py-1 ${a.id === agentId ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {a.label}
                </button>
              ))}
            </fieldset>
          )}
          <button
            type="button"
            onClick={() => onStart(agentId)}
            disabled={messages.length === 0}
            className={`${agents.length > 1 ? "" : "ml-auto "}rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40`}
          >
            New chat
          </button>
        </div>

        <div className="flex flex-1 flex-col-reverse overflow-y-auto px-4 py-5">
          {/* column-reverse keeps the scroll pinned to the newest message */}
          {messages.length === 0 ? (
            <Welcome onPick={send} />
          ) : (
            <div className="space-y-5">
              {messages.map((msg) =>
                msg.role === "user" ? (
                  <p
                    key={msg.id}
                    className="ml-auto w-fit max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm text-white"
                  >
                    {msg.text}
                  </p>
                ) : (
                  <Answer key={msg.id} message={msg} />
                ),
              )}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-slate-200 p-3"
        >
          <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-1.5 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter adds a line
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask a question about leave..."
              aria-label="Your question"
              className="max-h-32 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm outline-none field-sizing-content"
            />
            {isRunning ? (
              <button
                type="button"
                onClick={chat.stop}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
              >
                Send
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            AI answers can be wrong, so check the cited section. Please don't
            enter personal or medical details.
          </p>
        </form>
      </section>
    </div>
  );
}

function Welcome({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="m-auto max-w-md text-center">
      <Image
        src="/brand/renata-mark.png"
        alt=""
        width={132}
        height={132}
        className="mx-auto size-14"
      />
      <h2 className="mt-4 text-lg font-semibold text-slate-900">
        Hi, I'm your HR Leave Assistant
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Ask me about leave entitlements, how to apply, carry-forward, sick leave
        and more. I answer only from the XYZ Company Leave Policy.
      </p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {STARTERS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function Answer({ message }: { message: ChatMessage }) {
  const text = message.text.trim();
  // only the search agent has these: what its searchPolicy tool returned
  const sections = message.sections;

  if (!text) return <Typing />;

  // the two fixed replies get a label, so they're easy to tell apart
  const notCovered = text.startsWith(NOT_COVERED);
  const refused = text.startsWith(PRIVACY_REFUSAL);

  return (
    <div className="flex max-w-[90%] gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-2">
        {notCovered && (
          <Tag className="bg-amber-50 text-amber-800 ring-amber-200">
            Not covered by the policy
          </Tag>
        )}
        {refused && (
          <Tag className="bg-rose-50 text-rose-800 ring-rose-200">
            <LockIcon /> Confidential
          </Tag>
        )}
        <p className="whitespace-pre-wrap rounded-2xl rounded-tl-md bg-slate-100 px-4 py-2.5 text-sm leading-6 text-slate-800">
          {text}
        </p>

        {notCovered && (
          <p className="text-xs text-slate-500">
            HR Department:{" "}
            <a href={`mailto:${HR_EMAIL}`} className="text-brand-600 underline">
              {HR_EMAIL}
            </a>{" "}
            (Section 11.2)
          </p>
        )}

        {sections.length > 0 && (
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer text-slate-400 hover:text-slate-600">
              Policy sections checked ({sections.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {sections.map((s) => (
                <li
                  key={s.section}
                  className="rounded-lg border border-slate-200 p-2.5"
                >
                  <p className="font-medium text-slate-800">
                    Section {s.section} {s.heading}
                    <span className="ml-2 font-normal text-slate-400">
                      {s.via
                        ? `linked: ${s.via}`
                        : `match ${s.score?.toFixed(3)}`}
                    </span>
                  </p>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-slate-500">
                    {/* skip the "Section x - heading" line, it's already shown above */}
                    {s.text.split("\n\n").slice(1).join("\n\n")}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3 text-xs text-slate-500">
        <span className="flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="size-1.5 rounded-full bg-slate-400 animate-[typing_1s_infinite]"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
        Searching the policy
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
      <Image
        src="/brand/renata-mark.png"
        alt="HR Leave Assistant"
        width={132}
        height={132}
        className="size-5"
      />
    </span>
  );
}

function Tag({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}

function Rule({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        {icon}
      </span>
      <span>
        <span className="block font-medium text-slate-800">{title}</span>
        <span className="text-xs leading-5">{children}</span>
      </span>
    </li>
  );
}

function BookIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="size-4"
      aria-hidden="true"
    >
      <path d="M10 4.5C8.6 3.6 6.9 3 5 3c-.9 0-1.8.1-2.6.4A.6.6 0 0 0 2 4v11a.6.6 0 0 0 .8.6C3.5 15.2 4.2 15 5 15c1.7 0 3.3.6 4.4 1.6a.9.9 0 0 0 1.2 0C11.7 15.6 13.3 15 15 15c.8 0 1.5.2 2.2.5A.6.6 0 0 0 18 15V4a.6.6 0 0 0-.4-.6C16.8 3.1 15.9 3 15 3c-1.9 0-3.6.6-5 1.5Z" />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="size-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.9 7.2c.4-.5 1-.7 1.6-.6.8.1 1.3.7 1.3 1.3 0 .5-.3.8-.9 1.2-.6.4-1.4 1-1.4 2.1v.3a.75.75 0 0 0 1.5 0v-.3c0-.3.2-.5.7-.9.6-.4 1.6-1.1 1.6-2.4 0-1.5-1.2-2.6-2.6-2.8a3.3 3.3 0 0 0-2.9 1.1.75.75 0 1 0 1.1 1ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="size-3.5"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
