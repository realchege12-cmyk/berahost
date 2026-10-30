export async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    credentials: "include",
    ...opts,
  });
  if (!res.ok) {
    let errBody: any = {};
    try { errBody = await res.json(); } catch {}
    throw errBody;
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}
