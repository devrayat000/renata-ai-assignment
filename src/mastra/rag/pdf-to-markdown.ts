import { extractText, getDocumentProxy } from "unpdf";

// unpdf pulls tables out of reading order and loses the columns, so each
// table is cut out of its page, split back into columns with a row pattern,
// and put back under the section it belongs to.
const TABLES = [
  {
    startsWith: "Policy number",
    section: "title",
    header: null,
    columns: ["Field", "Value"],
    row: /^(Policy number|Version|Effective date|Policy owner|Applies to) (.+)$/,
  },
  {
    startsWith: "Leave type Entitlement",
    section: "4.0",
    header: "Leave type Entitlement Paid Section",
    columns: ["Leave type", "Entitlement", "Paid", "Section"],
    row: /^(.+? Leave|Compensatory Off) (.+) (Yes|No) (\d+\.\d+)$/,
  },
  {
    startsWith: "Role Responsibility",
    section: "10",
    header: "Role Responsibility",
    columns: ["Role", "Responsibility"],
    row: /^(Employee|Line manager|HR Department) (.+)$/,
  },
];

const TITLE = /^[A-Z].* Policy$/; // "XYZ Company Leave Policy"
const TOP_HEADING = /^(\d+)\.\s*([A-Z][A-Za-z ]+)$/; // "4. Types of Leave"
const SUB_HEADING = /^(\d+\.\d+)\s+([A-Z][A-Za-z ]+)$/; // "4.3 Sick Leave"
const CLAUSE = /^(\(\w\)|\d+\.\d+) /; // "(a) ..." or "2.1 ..."

type Block = { heading: string; lines: string[] };

export async function pdfToMarkdown(pdfBytes: Uint8Array) {
  const pdf = await getDocumentProxy(pdfBytes);
  const { text: pages } = await extractText(pdf, { mergePages: false });

  const lines: string[] = [];
  const tables: Record<string, string> = {};

  for (const page of pages) {
    // last two lines of every page are the running title and "Page x of 6"
    const pageLines = page.split("\n").slice(0, -2);
    for (const table of TABLES) {
      const start = pageLines.findIndex((l) => l.startsWith(table.startsWith));
      if (start !== -1) {
        tables[table.section] = renderTable(table, pageLines.splice(start));
      }
    }
    lines.push(...pageLines);
  }

  const blocks: Block[] = [];
  for (const line of lines) {
    const top = line.match(TOP_HEADING);
    const sub = line.match(SUB_HEADING);
    // clause lines like "5.3 Weekly holidays and public ..." also look like
    // headings, real subsection headings are only a few words long
    if (blocks.length === 0 && TITLE.test(line)) {
      blocks.push({ heading: `# ${line}`, lines: [] });
    } else if (sub && sub[2].split(" ").length <= 4) {
      blocks.push({ heading: `### ${sub[1]} ${sub[2]}`, lines: [] });
    } else if (top) {
      blocks.push({ heading: `## ${top[1]}. ${top[2]}`, lines: [] });
    } else {
      blocks[blocks.length - 1].lines.push(line);
    }
  }

  return `${blocks
    .map((block) => {
      const id = block.heading.match(/^#+ (\d+(?:\.\d+)?)/)?.[1] ?? "title";
      const parts = [block.heading, ...paragraphs(block.lines)];
      if (tables[id]) parts.push(tables[id]);
      return parts.join("\n\n");
    })
    .join("\n\n")}\n`;
}

// The PDF wraps lines at the page width. Join them back into paragraphs,
// starting a new one at each clause ("(a)", "2.1") or after a full stop.
function paragraphs(lines: string[]) {
  const result: string[] = [];
  for (const line of lines) {
    const prev = result[result.length - 1];
    const newParagraph =
      !prev || CLAUSE.test(line) || (prev.endsWith(".") && /^[A-Z]/.test(line));
    if (newParagraph) result.push(line);
    else result[result.length - 1] = `${prev} ${line}`;
  }
  return result;
}

function renderTable(table: (typeof TABLES)[number], lines: string[]) {
  const rows: string[][] = [];
  for (const line of lines) {
    if (line === table.header) continue;
    const match = line.match(table.row);
    if (match) rows.push(match.slice(1));
    // a row that wrapped onto the next line, add it to the last cell
    else if (rows.length > 0)
      rows[rows.length - 1][table.columns.length - 1] += ` ${line}`;
  }

  return [
    `| ${table.columns.join(" | ")} |`,
    `| ${table.columns.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}
