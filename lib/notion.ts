// Server only. Files a meeting into the SGA Notion Meetings database, laid out
// the way the board's meeting notes already are: When / Attendees / Main
// decisions, one section per topic, an action-items table, the next meeting,
// then the machine transcript in a collapsed toggle at the bottom.
import type { MeetingNotes } from "./meetings";

// NOTION_BASE_URL is for local testing against a stand-in; unset in production.
const API = process.env.NOTION_BASE_URL || "https://api.notion.com/v1";
const VERSION = "2025-09-03"; // data sources (databases with several sources) need this

export const notionConfigured = () => !!process.env.NOTION_TOKEN && !!process.env.NOTION_MEETINGS_DATA_SOURCE;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // Notion allows about three requests a second; back off when told to.
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * (Number(res.headers.get("retry-after")) || attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`Notion said ${res.status}: ${(await res.text().catch(() => "")).slice(0, 400)}`);
    return (await res.json()) as T;
  }
}

// --- rich text -----------------------------------------------------------------

type RT = Record<string, unknown>;
const txt = (content: string, ann: { bold?: boolean; italic?: boolean } = {}): RT[] => {
  // A text object holds at most 2000 characters.
  const out: RT[] = [];
  for (let i = 0; i < content.length || i === 0; i += 2000) {
    out.push({ type: "text", text: { content: content.slice(i, i + 2000) }, annotations: { bold: !!ann.bold, italic: !!ann.italic } });
    if (!content.length) break;
  }
  return out;
};
const dateMention = (start: string, end?: string): RT => ({
  type: "mention",
  mention: { type: "date", date: { start, ...(end ? { end } : {}), ...(start.includes("T") ? { time_zone: "Europe/Athens" } : {}) } },
});

const para = (rich: RT[]) => ({ object: "block", type: "paragraph", paragraph: { rich_text: rich } });
const h2 = (s: string) => ({ object: "block", type: "heading_2", heading_2: { rich_text: txt(s) } });
const bullet = (rich: RT[]) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rich } });
const cell = (rich: RT[]) => rich;

export type FileInput = {
  title: string;
  heldOn: string;      // YYYY-MM-DD
  startTime: string;   // HH:MM
  notes: MeetingNotes;
  transcript: string;
  minutes: number;
  attendeeIds: string[];
  projectIds: string[];
};

const addHour = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

function body(f: FileInput) {
  const n = f.notes;
  const blocks: unknown[] = [
    para([...txt("When: ", { bold: true }), dateMention(`${f.heldOn}T${f.startTime}:00`, `${f.heldOn}T${addHour(f.startTime)}:00`)]),
    para([...txt("Attendees: ", { bold: true }), ...txt(n.attendees_line)]),
    para([...txt("Main decisions: ", { bold: true }), ...txt(n.main_decisions)]),
  ];
  n.sections.forEach((s, i) => {
    blocks.push(h2(`${i + 1}. ${s.title}`));
    for (const b of s.bullets) blocks.push(bullet([...(b.label ? txt(`${b.label}: `, { bold: true }) : []), ...txt(b.text)]));
  });
  blocks.push(h2(`${n.sections.length + 1}. Action items`));
  blocks.push(para(txt("Owners marked TBD weren't clear from the recording. Open items from earlier meetings stay open.")));
  const rows = n.action_items.length ? n.action_items : [{ task: "", owner: "", due: "", status: "" }];
  blocks.push({
    object: "block", type: "table",
    table: {
      table_width: 4, has_column_header: true, has_row_header: false,
      children: [
        { type: "table_row", table_row: { cells: [txt("Task"), txt("Owner"), txt("Due"), txt("Status")].map(cell) } },
        ...rows.map((a) => ({ type: "table_row", table_row: { cells: [
          txt(a.task), txt(a.owner), /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? [dateMention(a.due)] : txt(a.due), txt(a.status),
        ] } })),
      ],
    },
  });
  if (/^\d{4}-\d{2}-\d{2}$/.test(n.next_meeting.date)) {
    const t = /^\d{2}:\d{2}$/.test(n.next_meeting.time) ? n.next_meeting.time : "";
    blocks.push(para([...txt("Next meeting: ", { bold: true }), dateMention(t ? `${n.next_meeting.date}T${t}:00` : n.next_meeting.date)]));
  }
  blocks.push({ object: "block", type: "divider", divider: {} });
  return blocks;
}

/** Create the page, then add the transcript toggle and fill it 100 lines at a
 *  time (Notion's limit per request). Returns the page URL. */
export async function fileMeeting(f: FileInput): Promise<string> {
  const properties: Record<string, unknown> = {
    Meetings: { title: txt(f.title) },
    Summary: { rich_text: txt(f.notes.summary.slice(0, 1900)) },
  };
  if (f.attendeeIds.length) properties.Attendees = { people: f.attendeeIds.map((id) => ({ object: "user", id })) };
  if (f.projectIds.length) properties.Projects = { relation: f.projectIds.map((id) => ({ id })) };

  const page = await call<{ id: string; url: string }>("POST", "/pages", {
    parent: { type: "data_source_id", data_source_id: process.env.NOTION_MEETINGS_DATA_SOURCE },
    properties,
    children: body(f).slice(0, 100),
  });
  const rest = body(f).slice(100);
  for (let i = 0; i < rest.length; i += 100) await call("PATCH", `/blocks/${page.id}/children`, { children: rest.slice(i, i + 100) });

  const lines = f.transcript.split("\n").map((l) => l.trim()).filter(Boolean);
  const intro = para(txt(`Machine transcript of the ${f.minutes}-minute recording. Recurring name errors are fixed. Speakers aren't labelled and some words are misheard, so check the audio before quoting anyone.`, { italic: true }));
  const added = await call<{ results: { id: string }[] }>("PATCH", `/blocks/${page.id}/children`, {
    children: [{ object: "block", type: "heading_2", heading_2: { rich_text: txt("Transcript (auto-generated)"), is_toggleable: true, children: [intro] } }],
  });
  const toggle = added.results[0].id;
  for (let i = 0; i < lines.length; i += 100) {
    await call("PATCH", `/blocks/${toggle}/children`, { children: lines.slice(i, i + 100).map((l) => para(txt(l))) });
  }
  return page.url;
}

/** Project pages to tag a meeting with, by title. Optional: only when
 *  NOTION_PROJECTS_DATA_SOURCE is set. */
export async function listProjects(): Promise<{ id: string; title: string }[]> {
  const ds = process.env.NOTION_PROJECTS_DATA_SOURCE;
  if (!ds || !process.env.NOTION_TOKEN) return [];
  const out: { id: string; title: string }[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const res = await call<{ results: { id: string; properties: Record<string, { type: string; title?: { plain_text: string }[] }> }[]; has_more: boolean; next_cursor?: string }>(
      "POST", `/data_sources/${ds}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    for (const p of res.results) {
      const t = Object.values(p.properties).find((v) => v.type === "title");
      const title = (t?.title || []).map((x) => x.plain_text).join("").trim();
      if (title) out.push({ id: p.id, title });
    }
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return out;
}
