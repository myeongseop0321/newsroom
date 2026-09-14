import { headers } from "next/headers";
import { database } from "@/db";

export type AppUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const SESSION_COOKIE = "pressroom_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
// Cloudflare Workers supports PBKDF2 iteration counts up to 100,000.
const PASSWORD_ITERATIONS = 100_000;

export async function getAppUser(): Promise<AppUser | null> {
  const requestHeaders = await headers();

  // ChatGPT Sites compatibility for the existing hosted preview.
  const sitesUserId = requestHeaders.get("oai-authenticated-user-id");
  const sitesEmail = requestHeaders.get("oai-authenticated-user-email");
  if (sitesUserId && sitesEmail) {
    const encodedName = requestHeaders.get("oai-authenticated-user-full-name");
    const fullName = encodedName ? safeDecodeURIComponent(encodedName) : null;
    return {
      userId: sitesUserId,
      displayName: fullName ?? sitesEmail,
      email: sitesEmail,
      fullName,
    };
  }

  const token = readCookie(requestHeaders.get("cookie"), SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256(token);
  const row = await database()
    .prepare(
      `SELECT u.id AS userId, u.email, u.display_name AS displayName
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(tokenHash, Date.now())
    .first<{ userId: string; email: string; displayName: string }>();

  if (!row) return null;
  return {
    userId: row.userId,
    displayName: row.displayName || row.email,
    email: row.email,
    fullName: row.displayName || null,
  };
}

export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{ user: AppUser; cookie: string }> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  validateCredentials(email, input.password, displayName);

  const salt = randomToken(16);
  const passwordHash = await hashPassword(input.password, salt);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await database()
      .prepare(
        "INSERT INTO users(id,email,display_name,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(userId, email, displayName, passwordHash, salt, now)
      .run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw new AuthError(409, "이미 가입된 이메일입니다.");
    }
    throw error;
  }

  const cookie = await createSession(userId);
  return {
    user: { userId, email, displayName, fullName: displayName },
    cookie,
  };
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<{ user: AppUser; cookie: string }> {
  const email = normalizeEmail(input.email);
  const row = await database()
    .prepare(
      "SELECT id,email,display_name AS displayName,password_hash AS passwordHash,password_salt AS passwordSalt FROM users WHERE email=?",
    )
    .bind(email)
    .first<{
      id: string;
      email: string;
      displayName: string;
      passwordHash: string;
      passwordSalt: string;
    }>();

  if (!row) throw new AuthError(401, "이메일 또는 비밀번호를 확인해 주세요.");
  const candidate = await hashPassword(input.password, row.passwordSalt);
  if (!constantTimeEqual(candidate, row.passwordHash)) {
    throw new AuthError(401, "이메일 또는 비밀번호를 확인해 주세요.");
  }

  const cookie = await createSession(row.id);
  return {
    user: {
      userId: row.id,
      email: row.email,
      displayName: row.displayName || row.email,
      fullName: row.displayName || null,
    },
    cookie,
  };
}

export async function logoutSession(cookieHeader: string | null): Promise<void> {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return;
  await database()
    .prepare("DELETE FROM sessions WHERE token_hash=?")
    .bind(await sha256(token))
    .run();
}

export function signInPath(returnTo: string): string {
  return `/login?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

export function signOutPath(returnTo = "/"): string {
  return `/api/auth/logout?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || url.pathname.startsWith("/api/auth")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function createSession(userId: string): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
  await database()
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
    )
    .bind(tokenHash, userId, expiresAt, new Date().toISOString())
    .run();
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

function validateCredentials(email: string, password: string, displayName: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new AuthError(400, "올바른 이메일을 입력해 주세요.");
  }
  if (password.length < 8 || password.length > 128) {
    throw new AuthError(400, "비밀번호는 8자 이상 입력해 주세요.");
  }
  if (!displayName || displayName.length > 40) {
    throw new AuthError(400, "이름은 1~40자로 입력해 주세요.");
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64UrlDecode(salt).buffer as ArrayBuffer,
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256,
  );
  return base64UrlEncode(new Uint8Array(bits));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
