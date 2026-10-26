import type { PolicySection } from "./chunk-policy";

export type PolicyEdge = {
  source: string;
  target: string;
  type: "cites" | "summarises" | "mentions";
};

// The policy's own links between sections:
// - cites:      "(see Section 8)" in the text
// - summarises: the Section column of the 4.0 summary table
// - mentions:   a section names a leave type that is defined in 4.1 to 4.8,
//               e.g. 6.3 says "may not refuse Sick Leave" -> 6 mentions 4.3
export function findEdges(sections: PolicySection[]): PolicyEdge[] {
  const ids = new Set(sections.map((s) => s.section));
  // leave types are the headings of 4.1 to 4.8 ("Sick Leave", "Compensatory Off")
  const leaveTypes = sections.filter(
    (s) => s.section.startsWith("4.") && s.section !== "4.0",
  );

  const edges = new Map<string, PolicyEdge>();
  const add = (source: string, target: string, type: PolicyEdge["type"]) => {
    const key = `${source}>${target}`;
    // keep the first, most specific link between two sections
    if (source !== target && ids.has(target) && !edges.has(key)) {
      edges.set(key, { source, target, type });
    }
  };

  for (const { section, text } of sections) {
    // skip the "Section x - heading" line, it names the section itself
    const body = text.slice(text.indexOf("\n\n") + 2);

    for (const m of body.matchAll(/Section (\d+(?:\.\d+)?)/g)) {
      add(section, m[1], "cites");
    }
    for (const m of body.matchAll(/\| (\d+\.\d+) \|$/gm)) {
      add(section, m[1], "summarises");
    }
    for (const type of leaveTypes) {
      if (body.includes(type.heading)) add(section, type.section, "mentions");
    }
  }

  return [...edges.values()];
}
