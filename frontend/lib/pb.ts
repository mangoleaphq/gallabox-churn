const PB_BASE     = process.env.PB_BASE     || "http://127.0.0.1:8090";
const PB_EMAIL    = process.env.PB_EMAIL    || "";
const PB_PASSWORD = process.env.PB_PASSWORD || "";

let _token: string | null = null;

export async function getPbToken(): Promise<string> {
  if (_token) return _token;
  const res = await fetch(`${PB_BASE}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
  });
  const json = await res.json();
  if (!json.token) throw new Error("PocketBase auth failed");
  _token = json.token;
  return _token!;
}

export async function pbFetch(path: string, init?: RequestInit): Promise<Response> {
  let token = await getPbToken();
  let res = await fetch(`${PB_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  // Retry once on 401 (token expired)
  if (res.status === 401) {
    _token = null;
    token = await getPbToken();
    res = await fetch(`${PB_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
    });
  }
  return res;
}
