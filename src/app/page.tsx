import Image from "next/image";
import { Suspense } from "react";
import { Chat } from "@/components/chat";
import { RAG_ENABLED } from "@/mastra";

export default function Home() {
  return (
    <div className="flex h-dvh flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Image
            src="/brand/renata-hr-division.png"
            alt="Renata PLC, Human Resources Division"
            width={209}
            height={45}
            preload
            className="h-9 w-auto"
          />
          <div className="hidden h-8 w-px bg-slate-200 sm:block" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base">
              Leave Policy Assistant
            </h1>
            <p className="truncate text-xs text-slate-500">
              AI Q&amp;A on the XYZ Company Leave Policy · HR-POL-004 v2.0
            </p>
          </div>
          <span className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-100 md:inline-flex">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Answers from the policy only
          </span>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 px-4 py-4">
        {/* chat creates a fresh thread id per visit, so it can't be prerendered */}
        <Suspense>
          <Chat ragEnabled={RAG_ENABLED} />
        </Suspense>
      </main>
    </div>
  );
}
