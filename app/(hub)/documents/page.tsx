import { DbDown } from "@/components/hub/bits";
import { ensureSchema, sql } from "@/lib/db";
import { blobConfigured, type Doc } from "@/lib/files";
import DocumentsBoard from "./DocumentsBoard";

export const metadata = { title: "Documents · SGA Hub" };

export default async function Documents() {
  try {
    await ensureSchema();
    const docs = (await sql()`SELECT id, pathname, name, content_type, size::int AS size, folder, tags, note, uploaded_by, created_at
      FROM hub_docs ORDER BY created_at DESC LIMIT 1000`) as Doc[];
    return <DocumentsBoard docs={docs} ready={blobConfigured()} />;
  } catch (err) {
    return <main className="hubpage"><header className="hubpage__head"><h1>Documents</h1></header><DbDown err={err} /></main>;
  }
}
