// The parts of lib/files that the browser needs too.

export type Doc = {
  id: string; pathname: string; name: string; content_type: string; size: number;
  folder: string; tags: string[]; note: string; uploaded_by: string; created_at: string;
};

export const fileUrl = (id: string) => `/api/files/${id}`;

export function humanSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
