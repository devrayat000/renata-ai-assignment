import type { ReactNode } from "react";

export type PolicySection = { section: string; heading: string; text: string };

// A citation like "4.3 (d)" or "8.1": the section, plus an optional clause
type Cite = { label: string; section?: PolicySection; excerpt?: string };

// "(Section 4.3)", "(Section 4.3 (d), Section 8.1)", "(Sections 4.1 and 4.2)"
const GROUP = /\(Sections? [^()]*(?:\([a-z]\)[^()]*)*\)/g;
// a single reference inside a group, or "Section 9" in the middle of a sentence
const REF = /(\d+(?:\.\d+)?)(?: ?\(?([a-z])\)(?![a-z]))?/g;
const BARE = /Section (\d+(?:\.\d+)?)(?: \(([a-z])\))?/g;

function lookup(
  number: string,
  clause: string | undefined,
  sections: PolicySection[],
): Cite {
  const label = clause ? `${number}(${clause})` : number;
  // "8.1" is a numbered clause inside section 8, "4.3" is a section of its own
  const section =
    sections.find((s) => s.section === number) ??
    sections.find((s) => number.startsWith(`${s.section}.`));
  if (!section) return { label };

  const lines = section.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(1); // first line is "Section x - heading"
  const marker = clause
    ? `(${clause})`
    : number !== section.section
      ? `${number} `
      : null;
  const excerpt = marker
    ? lines.find((l) => l.startsWith(marker))
    : lines.slice(0, 2).join(" ");
  return { label, section, excerpt };
}

function Chip({ cite }: { cite: Cite }) {
  return (
    <span className="group relative inline-block align-baseline">
      <button
        type="button"
        className="mx-0.5 inline-flex items-center rounded-md bg-blue-50 px-1.5 py-px text-[11px] font-medium text-blue-700 ring-1 ring-blue-200 ring-inset hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        §{cite.label}
      </button>
      {cite.section && (
        <span className="invisible absolute bottom-full left-0 z-10 mb-1.5 block w-80 rounded-lg border border-slate-200 bg-white p-3 text-xs font-normal text-slate-600 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
          <span className="block font-semibold text-slate-900">
            Section {cite.section.section} · {cite.section.heading}
          </span>
          {cite.excerpt && (
            <span className="mt-1 line-clamp-5 block">{cite.excerpt}</span>
          )}
        </span>
      )}
    </span>
  );
}

// Turns the section references in an answer into chips with a preview of the
// cited policy text. Returns the rendered text and the sections it cites.
export function renderCitations(text: string, sections: PolicySection[]) {
  const nodes: ReactNode[] = [];
  const cited = new Map<string, PolicySection>();
  const keep = (cite: Cite) => {
    if (cite.section) cited.set(cite.section.section, cite.section);
    return cite;
  };

  // first the bracketed groups, then plain "Section 9" in the remaining text
  const pieces = text.split(new RegExp(`(${GROUP.source})`));
  pieces.forEach((piece, i) => {
    if (i % 2 === 1) {
      for (const m of piece.matchAll(REF)) {
        nodes.push(
          <Chip key={nodes.length} cite={keep(lookup(m[1], m[2], sections))} />,
        );
      }
      return;
    }
    let last = 0;
    for (const m of piece.matchAll(BARE)) {
      nodes.push(piece.slice(last, m.index));
      nodes.push(
        <Chip key={nodes.length} cite={keep(lookup(m[1], m[2], sections))} />,
      );
      last = (m.index ?? 0) + m[0].length;
    }
    nodes.push(piece.slice(last));
  });

  return { nodes, cited: [...cited.values()] };
}
