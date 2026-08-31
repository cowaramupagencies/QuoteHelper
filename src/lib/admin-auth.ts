const COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "CoW@g$2020$";
}

function getSessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET ?? getAdminPassword();
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function verifyAdminPassword(password: string): boolean {
  const expected = getAdminPassword();
  if (password.length !== expected.length) return false;
  return timingSafeEqualStrings(password, expected);
}

async function signSession(expiresAt: number, secret: string): Promise<string> {
  const payload = String(expiresAt);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return `${payload}.${bufferToHex(signature)}`;
}

export async function createAdminSessionToken(): Promise<string> {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  return signSession(expiresAt, getSessionSecret());
}

export async function verifyAdminSessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [payload] = token.split(".");
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = await signSession(expiresAt, getSessionSecret());
  return timingSafeEqualStrings(token, expected);
}

export function getAdminSessionCookieName(): string {
  return COOKIE_NAME;
}

export function getAdminSessionCookieOptions(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function clearAdminSessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export function isAdminLoginPath(pathname: string): boolean {
  return pathname === "/admin/login" || pathname === "/api/admin/login";
}

export function isAdminProtectedPath(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
}
