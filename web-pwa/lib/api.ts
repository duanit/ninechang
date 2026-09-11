export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export type UserRole = "CUSTOMER" | "PROFESSIONAL" | "CONTRACTOR" | "ADMIN";
export type AuthUser = { id: string; email: string; displayName: string; role: UserRole; phone?: string | null; professional?: { bio?: string | null; verified: boolean; kycStatus: string; bankLast4?: string | null } | null };
export type AuthResult = { token: string; user: AuthUser };
const TOKEN_KEY = "ninechang_token";
const USER_KEY = "ninechang_user";
const CHAT_READ_PREFIX = "ninechang_chat_read_";

function browserStorage() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage;
}
export function getToken() { return browserStorage()?.getItem(TOKEN_KEY) ?? null; }
export function getStoredUser(): AuthUser | null {
  const value = browserStorage()?.getItem(USER_KEY);
  if (!value) return null;
  try { return JSON.parse(value) as AuthUser; } catch { clearSession(); return null; }
}
export function saveSession(result: AuthResult, remember: boolean) {
  clearSession();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, result.token);
  storage.setItem(USER_KEY, JSON.stringify(result.user));
}
export function clearSession() {
  if (typeof window === "undefined") return;
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(TOKEN_KEY); storage.removeItem(USER_KEY);
  }
}
export function getChatReadAt(roomId: string) {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(`${CHAT_READ_PREFIX}${roomId}`) ?? 0);
}
export function markChatRead(roomId: string, timestamp = Date.now()) {
  if (typeof window !== "undefined") localStorage.setItem(`${CHAT_READ_PREFIX}${roomId}`, String(timestamp));
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) { if (response.status === 401) clearSession(); throw new Error(value.message ?? "ไม่สามารถเชื่อมต่อระบบได้"); }
  return value as T;
}

export async function apiFormData<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new Error(value.message ?? "ไม่สามารถเชื่อมต่อระบบได้");
  }
  return value as T;
}

export function apiAssetUrl(path: string) {
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}
