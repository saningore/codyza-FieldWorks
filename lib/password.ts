import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = (await scryptAsync(password, salt, 32)) as Buffer;
  return `scrypt$${salt}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const next = (await scryptAsync(password, salt, 32)) as Buffer;
  const previous = Buffer.from(hash, "base64url");
  if (previous.length !== next.length) return false;
  return timingSafeEqual(previous, next);
}

const COMMON = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "123456789012",
  "123456789",
  "qwerty123456",
  "qwertyuiop",
  "letmein123",
  "welcome1",
  "admin12345",
  "iloveyou123",
  "changeme123",
  "fieldworks",
  "fieldworks1",
]);

export function passwordProblems(password: string, email = "") {
  const problems: string[] = [];
  if (password.length < 12 || password.length > 200) problems.push("Use 12 to 200 characters.");
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) problems.push("Use at least one letter and one number.");
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 3 && password.toLowerCase().includes(local)) problems.push("Do not include the name from your email.");
  if (COMMON.has(password.toLowerCase())) problems.push("Choose a password that is not commonly used.");
  return problems;
}

export function passwordAccepted(password: string, email = "") {
  return passwordProblems(password, email).length === 0;
}
