import { MDocument } from "@mastra/rag";

export type PolicySection = { section: string; heading: string; text: string };

// One chunk per policy section, split on the Markdown headings.
export async function chunkPolicy(markdown: string): Promise<PolicySection[]> {
  const chunks = await MDocument.fromMarkdown(markdown).chunk({
    strategy: "markdown",
    headers: [
      ["#", "title"],
      ["##", "section"],
      ["###", "subsection"],
    ],
  });

  return chunks.map((chunk) => {
    const title: string = chunk.metadata.subsection ?? chunk.metadata.section;
    const [, section = "0", heading = "Policy details"] =
      title?.match(/^(\d+(?:\.\d+)?)\.? (.+)$/) ?? [];
    // the section line on top is what the model cites
    const text = `Section ${section} - ${heading}\n\n${chunk.text.trim()}`;
    return { section, heading, text };
  });
}
