// Server only. The bits of the Gemini API the meetings pipeline needs: put a
// recording in the Files API, ask for text or JSON about it, delete it.
// Free tier is fine for a few meetings a week; note that on the free tier
// Google may use what is sent to improve its products.

// GEMINI_BASE_URL is for local testing against a stand-in; unset in production.
const BASE = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com";

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY isn't set");
  return k;
}

export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;

export type GeminiFile = { name: string; uri: string; mimeType: string };

async function check(res: Response, what: string) {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  const err = new Error(`${what}: Gemini said ${res.status} ${text.slice(0, 300)}`);
  (err as Error & { status?: number }).status = res.status;
  throw err;
}

/** Resumable upload in one go: start a session, send the bytes, finish. */
export async function uploadFile(bytes: Uint8Array, mimeType: string, displayName: string): Promise<GeminiFile> {
  const start = await fetch(`${BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key(),
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 100) } }),
  });
  await check(start, "starting the upload");
  const url = start.headers.get("x-goog-upload-url");
  if (!url) throw new Error("Gemini gave no upload URL");
  const put = await fetch(url, {
    method: "POST",
    headers: { "Content-Length": String(bytes.byteLength), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: bytes as BodyInit,
  });
  await check(put, "uploading the recording");
  const { file } = (await put.json()) as { file: { name: string; uri: string; mimeType: string; state: string } };

  // Audio is processed before it can be used; usually a few seconds.
  let state = file.state;
  for (let i = 0; state === "PROCESSING" && i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${BASE}/v1beta/${file.name}`, { headers: { "x-goog-api-key": key() } });
    await check(res, "checking the upload");
    state = ((await res.json()) as { state: string }).state;
  }
  if (state !== "ACTIVE") throw new Error(`Gemini couldn't process the recording (state ${state})`);
  return { name: file.name, uri: file.uri, mimeType: file.mimeType };
}

export async function deleteFile(name: string) {
  await fetch(`${BASE}/v1beta/${name}`, { method: "DELETE", headers: { "x-goog-api-key": key() } }).catch(() => {});
}

type Part = { text: string } | { file_data: { mime_type: string; file_uri: string } };

export async function generate(parts: Part[], opts: { json?: object; maxTokens?: number; thinking?: number } = {}): Promise<{ text: string; truncated: boolean }> {
  const res = await fetch(`${BASE}/v1beta/models/${geminiModel()}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key(), "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: opts.maxTokens ?? 65536,
        ...(opts.json ? { responseMimeType: "application/json", responseSchema: opts.json } : {}),
        ...(opts.thinking !== undefined ? { thinkingConfig: { thinkingBudget: opts.thinking } } : {}),
      },
    }),
  });
  await check(res, "asking Gemini");
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (body.promptFeedback?.blockReason) throw new Error(`Gemini refused the request (${body.promptFeedback.blockReason})`);
  const c = body.candidates?.[0];
  const text = (c?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  if (!text) throw new Error(`Gemini returned nothing (${c?.finishReason || "no reason given"})`);
  return { text, truncated: c?.finishReason === "MAX_TOKENS" };
}
