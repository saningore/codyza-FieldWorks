import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { billableAmount } from "@/lib/domain";
import { money } from "@/lib/format";
import { createEngagement, logWork } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function EngagementsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "practice") notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const clients = await tx<{ id: string; name: string }[]>`select id, name from clients order by name`;
    const engagements = await tx<{ id: string; name: string; status: string; rate_cents: number | null; client_id: string }[]>`
      select id, name, status, rate_cents, client_id from engagements order by name
    `;
    const logs = await tx<{ engagement_id: string; started_at: string; ended_at: string }[]>`
      select engagement_id, started_at::text, ended_at::text from work_logs
    `;
    return { clients, engagements, logs };
  });
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Engagements</h1>
      {data.engagements.length === 0 ? <p>No engagements yet.</p> : data.engagements.map((engagement) => {
        const minutes = data.logs.filter((log) => log.engagement_id === engagement.id).reduce((sum, log) => sum + (Date.parse(log.ended_at) - Date.parse(log.started_at)) / 60_000, 0);
        const amount = billableAmount(minutes, engagement.rate_cents);
        return (
          <article key={engagement.id} className="card">
            <h2 className="font-serif text-2xl">{engagement.name}</h2>
            <p>{engagement.status} · {Math.round(minutes)} minutes</p>
            <p>{amount == null ? "No rate is stored, so there is no billable amount." : `Billable ${money(amount)} from stored minutes and the rate.`}</p>
          </article>
        );
      })}
      {org.can("client.write") && data.clients.length > 0 ? (
        <div className="card">
          <ActionForm action={createEngagement} submitLabel="Add engagement">
            <input type="hidden" name="slug" value={slug} />
            <label className="field">Client
              <select name="clientId">{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
            </label>
            <label className="field">Name<input name="name" required /></label>
            <label className="field">Status
              <select name="status"><option>lead</option><option>active</option><option>done</option></select>
            </label>
            <label className="field">Hourly rate<input name="rate" type="number" min="0" step="0.01" /></label>
          </ActionForm>
        </div>
      ) : null}
      {org.can("time.write") && data.engagements.length > 0 ? (
        <div className="card">
          <h2 className="font-serif text-2xl">Log time</h2>
          <ActionForm action={logWork} submitLabel="Save time">
            <input type="hidden" name="slug" value={slug} />
            <label className="field">Engagement
              <select name="engagementId">{data.engagements.map((engagement) => <option key={engagement.id} value={engagement.id}>{engagement.name}</option>)}</select>
            </label>
            <label className="field">Started<input name="started" type="datetime-local" required /></label>
            <label className="field">Ended<input name="ended" type="datetime-local" required /></label>
            <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="billable" defaultChecked /> Billable</label>
            <label className="field">Notes<textarea name="notes" /></label>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
