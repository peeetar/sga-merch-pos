"use client";

import { useMemo, useState, useTransition } from "react";
import Uploader from "@/components/hub/Uploader";
import { Dialog } from "@/components/ui";
import { fileUrl, humanSize, type Doc } from "@/lib/files-client";
import { addDocs, removeDoc, updateDoc } from "./actions";

const FOLDERS = ["General", "Branding", "Photos", "Reports", "Minutes", "Receipts", "Contracts"];

export default function DocumentsBoard({ docs, ready }: { docs: Doc[]; ready: boolean }) {
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [uploadFolder, setUploadFolder] = useState("General");
  const [editing, setEditing] = useState<Doc | null>(null);
  const folders = [...new Set([...FOLDERS, ...docs.map((d) => d.folder)])];
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return docs.filter((d) => (!folder || d.folder === folder)
      && (!k || d.name.toLowerCase().includes(k) || d.note.toLowerCase().includes(k) || d.tags.some((t) => t.toLowerCase().includes(k))));
  }, [docs, q, folder]);
  const total = docs.reduce((n, d) => n + d.size, 0);

  return (
    <main className="hubpage">
      <header className="hubpage__head">
        <h1>Documents</h1>
        {ready && (
          <div className="row">
            <select className="field field--sm field--short" value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} aria-label="Upload into">
              {folders.filter((f) => f !== "Receipts").map((f) => <option key={f}>{f}</option>)}
            </select>
            <Uploader area="docs" multiple label="Upload files" onUploaded={async (files) => { await addDocs(files, uploadFolder, []); }} />
          </div>
        )}
      </header>
      {!ready && <div className="notice notice--warn"><strong>File storage isn&apos;t set up.</strong> In Vercel: Storage → Create → Blob, with <em>private</em> access, connected to this project (sets BLOB_READ_WRITE_TOKEN). Then redeploy.</div>}
      <p className="muted small">Private: files open only for signed-in board members. {docs.length} files, {humanSize(total)}. Receipts uploaded in Finance land in the Receipts folder.</p>

      <div className="row">
        <input className="field field--sm grow" placeholder="Search names, tags and notes" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="cats">
        <button className={"chip" + (!folder ? " is-on" : "")} onClick={() => setFolder(null)}>All</button>
        {folders.filter((f) => docs.some((d) => d.folder === f)).map((f) => (
          <button key={f} className={"chip" + (folder === f ? " is-on" : "")} onClick={() => setFolder(f)}>{f} · {docs.filter((d) => d.folder === f).length}</button>
        ))}
      </div>

      {shown.length === 0 ? <p className="muted">{docs.length ? "Nothing matches." : "No files yet."}</p> : (
        <div className="docgrid">
          {shown.map((d) => (
            <div key={d.id} className="doc">
              <a className="doc__thumb" href={fileUrl(d.id)} target="_blank" rel="noreferrer">
                {d.content_type.startsWith("image/")
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={fileUrl(d.id)} alt="" loading="lazy" />
                  : <span className="doc__ext">{(d.name.split(".").pop() || "file").slice(0, 4).toUpperCase()}</span>}
              </a>
              <div className="doc__meta">
                <a href={fileUrl(d.id)} target="_blank" rel="noreferrer" className="doc__name" title={d.name}>{d.name}</a>
                <span className="muted small">{d.folder} · {humanSize(d.size)} · {new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                {d.tags.length > 0 && <span className="doc__tags">{d.tags.map((t) => <i key={t}>{t}</i>)}</span>}
              </div>
              <button className="linkbtn doc__edit" onClick={() => setEditing(d)}>Edit</button>
            </div>
          ))}
        </div>
      )}
      {editing && <EditDoc doc={editing} folders={folders} onClose={() => setEditing(null)} />}
    </main>
  );
}

function EditDoc({ doc, folders, onClose }: { doc: Doc; folders: string[]; onClose: () => void }) {
  const [name, setName] = useState(doc.name);
  const [folder, setFolder] = useState(doc.folder);
  const [tags, setTags] = useState(doc.tags.join(", "));
  const [note, setNote] = useState(doc.note);
  const [busy, start] = useTransition();
  return (
    <Dialog title="File details" onClose={onClose}>
      <label className="lbl">Name<input className="field field--sm" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="lbl">Folder
        <input className="field field--sm" list="doc-folders" value={folder} onChange={(e) => setFolder(e.target.value)} />
        <datalist id="doc-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
      </label>
      <label className="lbl">Tags (comma-separated)<input className="field field--sm" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="logo, 2026, halloween" /></label>
      <label className="lbl">Note<textarea className="field field--sm" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="row">
        <button className="btn btn--sm btn--out" disabled={busy} onClick={() => {
          if (confirm(`Delete ${doc.name} for everyone? This can't be undone.`)) start(async () => { await removeDoc(doc.id); onClose(); });
        }}>Delete</button>
        <a className="btn btn--sm" href={fileUrl(doc.id) + "?download"}>Download</a>
        <span className="grow" />
        <button className="btn btn--sm" onClick={onClose}>Cancel</button>
        <button className="btn btn--sm btn--primary" disabled={busy || !name.trim()} onClick={() => start(async () => {
          await updateDoc(doc.id, { name, folder, tags: tags.split(","), note });
          onClose();
        })}>Save</button>
      </div>
    </Dialog>
  );
}
