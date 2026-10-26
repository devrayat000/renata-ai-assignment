import { Suspense } from "react";
import { Chat } from "@/components/chat";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col px-4 py-6 lg:h-screen">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">
          Leave Policy Assistant
        </h1>
        <p className="text-sm text-slate-500">
          Answers only from the XYZ Company Leave Policy (HR-POL-004, v2.0)
        </p>
      </header>
      {/* chat creates a fresh thread id per visit, so it can't be prerendered */}
      <Suspense>
        <Chat />
      </Suspense>
    </main>
  );
}
