"use client";

// Straight from the browser to the private Blob store, with progress. Big
// files go up in parts, so a phone on campus wifi can send a meeting recording.
import { upload } from "@vercel/blob/client";
import { useRef, useState } from "react";

export type Uploaded = { pathname: string; name: string; contentType: string; size: number };

const slug = (name: string) => name.normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").slice(-80) || "file";

export default function Uploader({ area, accept, multiple, label, onUploaded }: {
  area: "docs" | "receipts" | "meetings"; accept?: string; multiple?: boolean; label: string;
  onUploaded: (files: Uploaded[]) => Promise<void> | void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(files: FileList) {
    setError(null);
    setProgress(0);
    const total = [...files].reduce((n, f) => n + f.size, 0) || 1;
    let done = 0;
    const out: Uploaded[] = [];
    try {
      for (const f of files) {
        const res = await upload(`${area}/${slug(f.name)}`, f, {
          access: "private",
          handleUploadUrl: "/api/files/upload",
          multipart: f.size > 8 * 1024 * 1024,
          onUploadProgress: (p) => setProgress(Math.round(((done + p.loaded) / total) * 100)),
        });
        done += f.size;
        out.push({ pathname: res.pathname, name: f.name, contentType: res.contentType, size: f.size });
      }
      await onUploaded(out);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Vercel Blob: /, "") : "Upload failed.");
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="uploader">
      <input ref={input} type="file" hidden accept={accept} multiple={multiple}
        onChange={(e) => e.target.files?.length && send(e.target.files)} />
      <button type="button" className="btn btn--sm btn--primary" disabled={progress !== null} onClick={() => input.current?.click()}>
        {progress !== null ? `Uploading… ${progress}%` : label}
      </button>
      {progress !== null && <span className="uploader__bar"><i style={{ width: `${progress}%` }} /></span>}
      {error && <span className="error small">{error}</span>}
    </div>
  );
}
