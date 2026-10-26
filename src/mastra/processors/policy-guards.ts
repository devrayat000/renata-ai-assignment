import type { Processor } from "@mastra/core/processors";

export const NOT_COVERED = "I don't know, please contact HR.";

// Every reply has to come from the policy, so the first step always searches it.
export const searchFirst = {
  id: "search-policy-first",
  processInputStep({ stepNumber }) {
    return { toolChoice: stepNumber === 0 ? "required" : "auto" };
  },
} satisfies Processor;

// The "not covered" reply must be exactly NOT_COVERED. If the model starts
// with it and then keeps talking, drop the extra text from the stream.
export const exactFallback = {
  id: "exact-not-covered-reply",
  async processOutputStream({ part, state }) {
    if (part.type !== "text-delta") return part;

    const before = (state.text as string) ?? "";
    state.text = before + part.payload.text;

    if (before.startsWith(NOT_COVERED)) return null;
    if ((state.text as string).startsWith(NOT_COVERED)) {
      return {
        ...part,
        payload: { ...part.payload, text: NOT_COVERED.slice(before.length) },
      };
    }
    return part;
  },
} satisfies Processor;
