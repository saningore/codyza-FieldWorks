import { sql } from "@/server/db";

export async function GET() {
  if (process.env.FIELDWORKS_USE_FIXTURES === "1") {
    return Response.json({ ok: false, error: "fixtures refused" }, { status: 503 });
  }
  try {
    await sql`select 1 as ok`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
