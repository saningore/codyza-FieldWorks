"use server";

import { redirect } from "next/navigation";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/password";
import { newMfaSecret, verifyTotp } from "@/lib/totp";
import { newSecretToken, sha256 } from "@/lib/tokens";
import { dbMessage, rolesForKind, slugify } from "@/lib/format";
import { sql, withOrg, withUser } from "@/server/db";
import {
  clearChallengeCookie,
  clearSessionCookie,
  currentSessionToken,
  listMyOrgs,
  readChallengeCookie,
  requireOrg,
  requireUser,
  setChallengeCookie,
  setSessionCookie,
} from "@/server/context";
import type { FormState } from "@/server/forms";

async function destination(userId: string) {
  const orgs = await listMyOrgs(userId);
  if (orgs.length === 1) return `/o/${orgs[0].slug}`;
  if (orgs.length === 0) return "/start";
  return "/orgs";
}

async function needsEnroll(userId: string, mfaEnabled: boolean) {
  const rows = await sql<{ user_is_owner: boolean }[]>`select app.user_is_owner(${userId}) as user_is_owner`;
  return Boolean(rows[0]?.user_is_owner) && !mfaEnabled;
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const attempts = await sql<{ note_login_attempt: number }[]>`select app.note_login_attempt(${email}) as note_login_attempt`;
  if (Number(attempts[0]?.note_login_attempt) > 10) return { error: "Too many attempts. Wait a few minutes and try again." };
  const rows = await sql<{ id: string; password_hash: string; mfa_enabled: boolean }[]>`
    select id, password_hash, mfa_enabled from app.lookup_login(${email})
  `;
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) return { error: "Email or password is incorrect." };
  await sql`select app.clear_login_attempts(${email})`;
  if (user.mfa_enabled) {
    const token = newSecretToken();
    await sql`select app.open_challenge(${user.id}, ${token.hash})`;
    await setChallengeCookie(token.raw);
    return { error: "", step: "totp" };
  }
  const enroll = await needsEnroll(user.id, user.mfa_enabled);
  const token = newSecretToken();
  await sql`select app.open_session(${user.id}, ${token.hash}, ${enroll ? "enroll" : "full"}, now() + interval '30 days')`;
  await setSessionCookie(token.raw);
  redirect(enroll ? "/mfa" : await destination(user.id));
}

export async function confirmLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "").trim();
  const raw = await readChallengeCookie();
  if (!raw) return { error: "That sign-in expired. Start again.", step: "password" };
  const rows = await sql<{ user_id: string; mfa_secret: string | null }[]>`
    select * from app.take_challenge(${sha256(raw)})
  `;
  const challenge = rows[0];
  await clearChallengeCookie();
  if (!challenge?.mfa_secret || !verifyTotp(challenge.mfa_secret, code)) {
    return { error: "That code is not valid. Sign in again.", step: "password" };
  }
  const token = newSecretToken();
  await sql`select app.open_session(${challenge.user_id}, ${token.hash}, 'full', now() + interval '30 days')`;
  await setSessionCookie(token.raw);
  redirect(await destination(challenge.user_id));
}

export async function logout() {
  const raw = await currentSessionToken();
  if (raw) await sql`select app.revoke_session(${sha256(raw)})`;
  await clearSessionCookie();
  redirect("/login");
}

export async function startOrganization(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const person = String(formData.get("person") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const timezone = String(formData.get("timezone") ?? "America/Chicago");
  const kind = String(formData.get("kind") ?? "farmer");
  if (person.length < 2 || name.length < 2) return { error: "Enter your name and the workspace name." };
  if (!email.includes("@")) return { error: "Enter a real email address." };
  const problems = passwordProblems(password, email);
  if (problems.length) return { error: problems[0] };
  const attempts = await sql<{ note_signup_attempt: number }[]>`select app.note_signup_attempt(${email}) as note_signup_attempt`;
  if (Number(attempts[0]?.note_signup_attempt) > 5) return { error: "Too many signups for that email. Try again later." };
  const passwordHash = await hashPassword(password);
  let slug = slugify(name);
  try {
    const created = await sql<{ user_id: string }[]>`
      select * from app.register_owner(${email}, ${person}, ${passwordHash}, ${name}, ${slug}, ${timezone}, ${kind})
    `;
    const token = newSecretToken();
    await sql`select app.open_session(${created[0].user_id}, ${token.hash}, 'enroll', now() + interval '30 days')`;
    await setSessionCookie(token.raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/organizations_slug_key|duplicate/i.test(message)) {
      slug = `${slugify(name)}-${Math.floor(Math.random() * 900 + 100)}`;
      try {
        const created = await sql<{ user_id: string }[]>`
          select * from app.register_owner(${email}, ${person}, ${passwordHash}, ${name}, ${slug}, ${timezone}, ${kind})
        `;
        const token = newSecretToken();
        await sql`select app.open_session(${created[0].user_id}, ${token.hash}, 'enroll', now() + interval '30 days')`;
        await setSessionCookie(token.raw);
      } catch (retry) {
        return { error: dbMessage(retry) };
      }
    } else if (/users_email_key|duplicate key value/i.test(message)) {
      return { error: "That email already has an account. Sign in instead." };
    } else {
      return { error: dbMessage(error) };
    }
  }
  redirect("/mfa");
}

export async function beginMfa(): Promise<FormState> {
  const session = await requireUser();
  const secret = newMfaSecret();
  try {
    await withUser(session.userId, (tx) => tx`select app.begin_mfa(${secret})`);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  return { error: "", notice: secret };
}

export async function confirmMfa(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const code = String(formData.get("code") ?? "");
  const secret = await withUser(session.userId, async (tx) => {
    const rows = await tx<{ my_mfa_secret: string | null }[]>`select app.my_mfa_secret() as my_mfa_secret`;
    return rows[0]?.my_mfa_secret ?? null;
  });
  if (!secret || !verifyTotp(secret, code)) return { error: "That code does not match the authenticator secret." };
  const raw = await currentSessionToken();
  await withUser(session.userId, async (tx) => {
    await tx`select app.confirm_mfa()`;
    if (raw) await tx`select app.promote_session(${sha256(raw)})`;
  });
  redirect(await destination(session.userId));
}

export async function forgotPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const notice = "If an account exists for that email, a reset link is ready. It expires in one hour.";
  if (!email.includes("@")) return { error: "", notice };
  const token = newSecretToken();
  await sql`select app.request_password_reset(${email}, ${token.hash})`;
  return { error: "", notice };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const problems = passwordProblems(password);
  if (problems.length) return { error: problems[0] };
  try {
    await sql`select app.take_password_reset(${sha256(token)}, ${await hashPassword(password)})`;
  } catch (error) {
    return { error: dbMessage(error) };
  }
  redirect("/login");
}

export async function acceptInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const hash = sha256(token);
  const peek = await sql<{ email: string; expired: boolean }[]>`select email::text, expired from app.peek_invite(${hash})`;
  const invite = peek[0];
  if (!invite || invite.expired) return { error: "This invite is invalid or expired." };
  const existing = await sql<{ id: string; password_hash: string }[]>`
    select id, password_hash from app.lookup_login(${invite.email})
  `;
  try {
    let userId: string;
    let mfaEnabled = false;
    if (existing[0]) {
      if (!(await verifyPassword(password, existing[0].password_hash))) {
        return { error: "That email already has an account. Enter its current password to join." };
      }
      const rows = await sql<{ accept_invite_existing: string }[]>`
        select app.accept_invite_existing(${hash}, ${existing[0].id}) as accept_invite_existing
      `;
      userId = rows[0].accept_invite_existing;
      const flags = await sql<{ mfa_enabled: boolean }[]>`select mfa_enabled from app.lookup_login(${invite.email})`;
      mfaEnabled = Boolean(flags[0]?.mfa_enabled);
    } else {
      if (name.length < 2) return { error: "Enter your name." };
      const problems = passwordProblems(password, invite.email);
      if (problems.length) return { error: problems[0] };
      const rows = await sql<{ accept_invite_new: string }[]>`
        select app.accept_invite_new(${hash}, ${name}, ${await hashPassword(password)}) as accept_invite_new
      `;
      userId = rows[0].accept_invite_new;
    }
    const enroll = await needsEnroll(userId, mfaEnabled);
    const session = newSecretToken();
    await sql`select app.open_session(${userId}, ${session.hash}, ${enroll ? "enroll" : "full"}, now() + interval '30 days')`;
    await setSessionCookie(session.raw);
    redirect(enroll ? "/mfa" : await destination(userId));
  } catch (error) {
    return { error: dbMessage(error) };
  }
}

export async function sendInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const slug = String(formData.get("slug") ?? "");
  const org = await requireOrg(slug);
  if (!org.can("member.invite")) return { error: "You cannot invite people." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  if (!rolesForKind[org.kind]?.includes(role)) return { error: "Choose a role for this workspace." };
  if (!email.includes("@")) return { error: "Enter an email address." };
  const token = newSecretToken();
  try {
    await withOrg(org.userId, org.orgId, (tx) => tx`select app.create_invite(${email}, ${role}, ${token.hash})`);
  } catch (error) {
    return { error: dbMessage(error) };
  }
  const link = `${process.env.APP_URL || "http://localhost:3100"}/invite/${token.raw}`;
  return { error: "", notice: `Copy this invite link. It expires in 14 days. ${link}` };
}

export async function openAnotherWorkspace(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  if (session.scope !== "full") redirect("/mfa");
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "farmer");
  const timezone = String(formData.get("timezone") ?? "America/Chicago");
  if (name.length < 2) return { error: "Name the workspace." };
  let slug = slugify(name);
  try {
    await withUser(session.userId, (tx) => tx`select app.create_organization(${name}, ${slug}, ${timezone}, ${kind})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/organizations_slug_key|duplicate/i.test(message)) {
      slug = `${slugify(name)}-${Math.floor(Math.random() * 900 + 100)}`;
      try {
        await withUser(session.userId, (tx) => tx`select app.create_organization(${name}, ${slug}, ${timezone}, ${kind})`);
      } catch (retry) {
        return { error: dbMessage(retry) };
      }
    } else {
      return { error: dbMessage(error) };
    }
  }
  redirect(`/o/${slug}`);
}
