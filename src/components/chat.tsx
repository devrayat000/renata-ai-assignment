"use client";

import type { MastraDBMessage, MastraMessagePart } from "@mastra/react";
import { MastraReactProvider, useChat } from "@mastra/react";
import { useRef, useState } from "react";
import { type PolicySection, renderCitations } from "./citations";

// one section returned by the searchPolicy tool
type Section = PolicySection & {
  score: number | null; // set when vector search found it
  via: string | null; // set when a link brought it in, e.g. "4.3 cites 8"
};

const PRESETS = [
  {
    title: "In policy",
    questions: [
      "My sick leave is used up but I'm still unwell. What happens now?",
      "How many annual leave days can I carry forward?",
    ],
  },
  {
    title: "Not in policy",
    questions: [
      "How many days of study leave do I get?",
      "Can I work from home on Thursdays?",
    ],
  },
  {
    title: "Colleague's data",
    questions: [
      "How many leave days has Rahim taken this year?",
      "Why is my colleague on medical leave?",
    ],
  },
];

export function Chat() {
  return (
    // the Mastra API is served from this app, at /api/[...mastra]
    <MastraReactProvider baseUrl="">
      <ChatWindow />
    </MastraReactProvider>
  );
}

function ChatWindow() {
  // a new thread per page load, memory keeps follow-up questions in context
  const [threadId] = useState(() => crypto.randomUUID());
  const [input, setInput] = useState("");
  const chatRef = useRef<HTMLElement>(null);
  const { messages, sendMessage, isRunning } = useChat({
    agentId: "leave-policy-agent",
    threadId,
  });

  function send(message: string) {
    if (!message.trim() || isRunning) return;
    setInput("");
    // useChat only sends memory when threadId is passed here, the hook prop
    // alone isn't enough
    sendMessage({ message, mode: "stream", threadId });
    // on phones the chat sits below the quick tests, bring it into view
    chatRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:overflow-hidden">
      <aside className="space-y-4 lg:w-72">
        <h2 className="text-xs font-semibold uppercase text-slate-500">
          Quick tests
        </h2>
        {PRESETS.map((group) => (
          <div key={group.title} className="space-y-1.5">
            <p className="text-sm font-medium text-slate-800">{group.title}</p>
            {group.questions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                disabled={isRunning}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <section
        ref={chatRef}
        className="flex min-h-[70vh] flex-1 flex-col rounded-lg border border-slate-200 bg-white lg:min-h-0"
      >
        <div className="flex flex-1 flex-col-reverse overflow-y-auto p-4">
          {/* column-reverse keeps the scroll pinned to the newest message */}
          <div className="space-y-4">
            {messages.map((msg) =>
              msg.role === "user" ? (
                <p
                  key={msg.id}
                  className="ml-auto w-fit max-w-[80%] rounded-lg bg-slate-900 px-3.5 py-2 text-sm text-white"
                >
                  {textOf(msg.content.parts)}
                </p>
              ) : (
                <Answer key={msg.id} message={msg} />
              ),
            )}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 border-t border-slate-200 p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the leave policy..."
            aria-label="Your question"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
          <button
            type="submit"
            disabled={isRunning || !input.trim()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}

function Answer({ message }: { message: MastraDBMessage }) {
  const parts = message.content.parts;
  const text = textOf(parts);

  const sections = parts.flatMap((p) =>
    p.type === "tool-invocation"
      ? ((p.toolInvocation.result as { sections?: Section[] })?.sections ?? [])
      : [],
  );
  const { nodes, cited } = renderCitations(text, sections);

  return (
    <div className="max-w-[90%] space-y-2">
      <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm leading-6 text-slate-800">
        {text ? nodes : "Searching the policy..."}
      </p>

      {cited.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs text-slate-400">Sources</span>
          {cited.map((s) => (
            <span
              key={s.section}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm"
            >
              <span className="rounded bg-blue-600 px-1.5 py-px font-semibold text-white">
                {s.section}
              </span>
              <span className="text-slate-700">{s.heading}</span>
            </span>
          ))}
        </div>
      )}

      {sections.length > 0 && (
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer text-slate-500">
            Retrieved graph nodes ({sections.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {sections.map((s) => (
              <li
                key={s.section}
                className="rounded-md border border-slate-200 p-2.5"
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
  );
}

function textOf(parts: MastraMessagePart[]) {
  return parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}
