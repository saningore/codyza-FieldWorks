import { notFound } from "next/navigation";
import { reiUntil } from "@/lib/domain";
import { formatDay } from "@/lib/format";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function CalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "farmer") notFound();
  const rows = await withOrg(org.userId, org.orgId, (tx) => tx<{ kind: string; status: string; target_on: string | null; completed_on: string | null; field_name: string; rei_hours: number | null; phi_hours: number | null }[]>`
    select a.kind, a.status, a.target_on::text, a.completed_on::text, f.name as field_name, a.rei_hours, a.phi_hours
    from activities a join fields f on f.id = a.field_id
    order by coalesce(a.target_on, a.completed_on) nulls last
  `);
  const planned = rows.filter((row) => row.status === "planned");
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Crop calendar</h1>
      <p>Planned dates come from stored activities. A template only appears here after someone applies it.</p>
      {planned.length === 0 ? <p>No planned activities.</p> : (
        <ul className="grid gap-2">
          {planned.map((row) => (
            <li key={`${row.field_name}-${row.kind}-${row.target_on}`} className="card">
              {row.target_on ? formatDay(row.target_on, org.timezone) : "No date"} · {row.field_name} · {row.kind}
            </li>
          ))}
        </ul>
      )}
      <section className="card">
        <h2 className="font-serif text-2xl">Re-entry and harvest holds</h2>
        {rows.filter((row) => row.kind === "pesticide" && row.status === "done" && (row.rei_hours != null || row.phi_hours != null)).length === 0
          ? <p>No pesticide record includes a re-entry or pre-harvest interval.</p>
          : rows.filter((row) => row.kind === "pesticide" && row.status === "done").map((row) => (
            <p key={`${row.field_name}-${row.completed_on}`}>{row.field_name}: do not enter until {reiUntil(row.completed_on, row.rei_hours) ?? "hours were not entered"}, do not harvest until {reiUntil(row.completed_on, row.phi_hours) ?? "hours were not entered"}.</p>
          ))}
      </section>
    </div>
  );
}
