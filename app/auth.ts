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
export const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_HASH_VERSION = "v2:";

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
  passwordVerifier: string;
  passwordSalt: string;
  displayName: string;
}): Promise<{ user: AppUser; cookie: string }> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  validateCredentials(email, input.passwordVerifier, input.passwordSalt, displayName);

  const passwordHash = PASSWORD_HASH_VERSION + await sha256(input.passwordVerifier);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await database()
      .prepare(
        "INSERT INTO users(id,email,display_name,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?)",
      )
        .bind(userId, email, displayName, passwordHash, input.passwordSalt, now)
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
  passwordVerifier: string;
}): Promise<{ user: AppUser; cookie: string }> {
  const email = normalizeEmail(input.email);
  const row = await database()
    .prepare(
      "SELECT id,email,display_name AS displayName,password_hash AS passwordHash FROM users WHERE email=?",
    )
    .bind(email)
    .first<{
      id: string;
      email: string;
      displayName: string;
      passwordHash: string;
    }>();

  if (!row) throw new AuthError(401, "이메일 또는 비밀번호를 확인해 주세요.");
  if (!isVerifier(input.passwordVerifier)) throw new AuthError(400, "로그인 정보를 다시 입력해 주세요.");
  const upgraded = row.passwordHash.startsWith(PASSWORD_HASH_VERSION);
  const candidate = upgraded ? PASSWORD_HASH_VERSION + await sha256(input.passwordVerifier) : input.passwordVerifier;
  if (!constantTimeEqual(candidate, row.passwordHash)) {
    throw new AuthError(401, "이메일 또는 비밀번호를 확인해 주세요.");
  }
  if (!upgraded) {
    await database().prepare("UPDATE users SET password_hash=? WHERE id=?").bind(PASSWORD_HASH_VERSION + await sha256(input.passwordVerifier), row.id).run();
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

export async function getPasswordChallenge(emailValue: string): Promise<{ salt: string; iterations: number }> {
  const email = normalizeEmail(emailValue);
  const row = email.length <= 254 ? await database().prepare("SELECT password_salt AS salt FROM users WHERE email=?").bind(email).first<{salt:string}>() : null;
  return {salt:row?.salt||randomToken(16),iterations:PASSWORD_ITERATIONS};
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

function validateCredentials(email: string, verifier: string, salt: string, displayName: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new AuthError(400, "올바른 이메일을 입력해 주세요.");
  }
  if (!isVerifier(verifier)||!isSalt(salt)) throw new AuthError(400, "회원가입 정보를 다시 입력해 주세요.");
  if (!displayName || displayName.length > 40) {
    throw new AuthError(400, "이름은 1~40자로 입력해 주세요.");
  }
}

const isVerifier=(value:string)=>/^[A-Za-z0-9_-]{43}$/.test(value);
const isSalt=(value:string)=>/^[A-Za-z0-9_-]{22}$/.test(value);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
