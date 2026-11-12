import { formatWhen } from "@/lib/format";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function ActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  const rows = await withOrg(org.userId, org.orgId, (tx) => tx<{ summary: string; created_at: string; name: string | null }[]>`
    select a.summary, a.created_at::text, u.name
    from activity_log a left join users u on u.id = a.actor_id
    order by a.created_at desc limit 40
  `);
  return (
    <div className="grid gap-3">
      <h1 className="font-serif text-4xl">Activity</h1>
      {rows.length === 0 ? <p>No activity has been stored in this workspace.</p> : rows.map((row) => (
        <p key={`${row.created_at}-${row.summary}`} className="card">{formatWhen(row.created_at, org.timezone)} · {row.name ?? "Someone"} · {row.summary}</p>
      ))}
    </div>
  );
}
