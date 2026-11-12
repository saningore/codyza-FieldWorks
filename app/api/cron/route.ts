import { sql } from "@/server/db";

export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await sql<{ purge_due: number }[]>`select app.purge_due() as purge_due`;
  return Response.json({ purged: Number(rows[0]?.purge_due ?? 0) });
}
