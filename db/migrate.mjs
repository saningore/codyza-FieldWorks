import { readFileSync } from "node:fs";
import postgres from "postgres";

function envPath() {
  const index = process.argv.indexOf("--env");
  if (index === -1) return new URL("../.env", import.meta.url);
  const file = process.argv[index + 1];
  if (!file) {
    console.error("--env needs a file path");
    process.exit(1);
  }
  return new URL(`../${file}`, import.meta.url);
}

function loadEnv(file) {
  try {
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim();
      if (process.argv.includes("--env") || !process.env[key]) process.env[key] = value;
    }
  } catch {
    if (process.argv.includes("--env")) {
      console.error(`Could not read ${file.pathname}`);
      process.exit(1);
    }
  }
}

loadEnv(envPath());

const adminUrl = process.env.DATABASE_URL_ADMIN;
if (!adminUrl) {
  console.error("DATABASE_URL_ADMIN is required");
  process.exit(1);
}

const appPassword = process.env.APP_DB_PASSWORD || "fieldworks_app";
if (!/^[A-Za-z0-9_-]{8,200}$/.test(appPassword)) {
  console.error("APP_DB_PASSWORD must be 8 to 200 letters, numbers, underscores, or hyphens.");
  process.exit(1);
}

const host = new URL(adminUrl.replace(/^postgres(ql)?:/, "http:")).hostname;
const reset = process.argv.includes("--reset");
if (reset && host !== "localhost" && host !== "127.0.0.1") {
  console.error("Refusing --reset against a remote database. It drops the public schema.");
  process.exit(1);
}

const sql = postgres(adminUrl, {
  max: 1,
  onnotice: () => {},
  connection: { search_path: "public,extensions,app" },
  ssl: host === "localhost" || host === "127.0.0.1" ? false : "require",
});

try {
  if (reset) {
    await sql.unsafe(`
      drop schema if exists public cascade;
      drop schema if exists app cascade;
      create schema public;
      grant all on schema public to public;
    `);
  }

  const existing = await sql`select to_regclass('public.organizations') as name`;
  if (existing[0]?.name && !reset) {
    console.log("Schema already present. Use --reset to rebuild a local database.");
  } else {
    const roles = await sql`select 1 from pg_roles where rolname = 'fieldworks_app'`;
    if (roles.length === 0) {
      await sql.unsafe(
        `create role fieldworks_app login password '${appPassword}' nosuperuser nobypassrls nocreatedb`,
      );
    }
    await sql.unsafe(`alter role fieldworks_app password '${appPassword}'`);
    if (host.endsWith("supabase.co") || host.endsWith("pooler.supabase.com")) {
      await sql.unsafe(`
        create schema if not exists extensions;
        create extension if not exists postgis with schema extensions;
      `);
    }
    const file = readFileSync(new URL("./migrations/001_schema.sql", import.meta.url), "utf8");
    await sql.unsafe(file);
    console.log("Migration applied.");
  }
} finally {
  await sql.end();
}
