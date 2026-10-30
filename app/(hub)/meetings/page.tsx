import { DbDown } from "@/components/hub/bits";
import { currentTerm, ensureSchema, getSetting, sql } from "@/lib/db";
import { blobConfigured } from "@/lib/files";
import { geminiConfigured, geminiModel } from "@/lib/gemini";
import { listMeetings } from "@/lib/meetings";
import { notionConfigured } from "@/lib/notion";
import MeetingsBoard from "./MeetingsBoard";

export const metadata = { title: "Meetings · SGA Hub" };

export default async function Meetings() {
  try {
    await ensureSchema();
    const term = await currentTerm();
    const [meetings, people, context, fixes] = await Promise.all([
      listMeetings(),
      sql()`SELECT p.id, p.name, r.title AS role, p.notion_user_id FROM hub_people p LEFT JOIN hub_roles r ON r.id = p.role_id
        WHERE p.term = ${term} ORDER BY r.sort NULLS LAST, p.name`.then((r) => r as { id: string; name: string; role: string | null; notion_user_id: string | null }[]),
      getSetting("meeting_context", ""),
      getSetting("meeting_fixes", ""),
    ]);
    return <MeetingsBoard meetings={meetings} people={people} context={context} fixes={fixes}
      ready={{ blob: blobConfigured(), gemini: geminiConfigured(), notion: notionConfigured(), model: geminiModel() }} />;
  } catch (err) {
    return <main className="hubpage"><header className="hubpage__head"><h1>Meetings</h1></header><DbDown err={err} /></main>;
  }
}
