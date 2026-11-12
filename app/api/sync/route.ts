import { z } from "zod";
import { getSession, loadOrg } from "@/server/context";
import { withOrg } from "@/server/db";

const bodySchema = z.object({
  slug: z.string().min(1),
  fieldId: z.string().uuid(),
  kind: z.enum(["planting", "irrigation", "fertilizer", "pesticide", "observation", "harvest"]),
  notes: z.string().max(4000).default(""),
  completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idempotencyKey: z.string().min(8).max(80),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.scope !== "full") return Response.json({ error: "Sign in required." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the field note." }, { status: 400 });
  const org = await loadOrg(parsed.data.slug);
  if (!org || org === "login" || org === "mfa") return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!org.can("activity.write")) return Response.json({ error: "You cannot record field work." }, { status: 403 });
  try {
    const inserted = await withOrg(org.userId, org.orgId, (tx) => tx<{ id: string }[]>`
      insert into activities (
        organization_id, field_id, kind, status, completed_on, notes, created_by, idempotency_key
      ) values (
        ${org.orgId}, ${parsed.data.fieldId}, ${parsed.data.kind}, 'done', ${parsed.data.completedOn},
        ${parsed.data.notes}, ${org.userId}, ${parsed.data.idempotencyKey}
      )
      returning id
    `);
    return Response.json({ id: inserted[0].id, replayed: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/duplicate|unique/i.test(message)) return Response.json({ error: "Could not save that note." }, { status: 400 });
    const existing = await withOrg(org.userId, org.orgId, (tx) => tx<{ id: string }[]>`
      select id from activities
      where organization_id = ${org.orgId} and idempotency_key = ${parsed.data.idempotencyKey}
    `);
    return Response.json({ id: existing[0]?.id ?? null, replayed: true });
  }
}
