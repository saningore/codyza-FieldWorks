import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { saveDecision } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

type DecisionRow = {
  id: string;
  title: string;
  status: string;
  revision: number;
  problem: string;
  options: string;
  final_decision: string;
  reason: string;
  decided_on: string | null;
};

export default async function DecisionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "engineer" && org.kind !== "practice") notFound();
  const decisions = await withOrg(org.userId, org.orgId, (tx) => tx<DecisionRow[]>`
    select d.id, d.title, d.status, d.decided_on::text, r.revision, r.problem, r.options, r.final_decision, r.reason
    from decisions d
    join decision_revisions r on r.decision_id = d.id
    order by d.title, r.revision
  `);
  const grouped = new Map<string, DecisionRow[]>();
  for (const row of decisions) {
    const list = grouped.get(row.id) ?? [];
    list.push(row);
    grouped.set(row.id, list);
  }
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Decisions</h1>
      {grouped.size === 0 ? <p>No decisions recorded.</p> : [...grouped.values()].map((revisions) => (
        <article key={revisions[0].id} className="card">
          <h2 className="font-serif text-2xl">{revisions[0].title}</h2>
          <p>{revisions[0].status}{revisions[0].decided_on ? ` · ${revisions[0].decided_on}` : ""}</p>
          {revisions.map((revision) => (
            <div key={revision.revision} className="mt-3 border-t border-line pt-3">
              <p className="font-bold">Revision {revision.revision}</p>
              <p>Problem: {revision.problem}</p>
              <p>Options: {revision.options}</p>
              <p>Decision: {revision.final_decision}</p>
              <p>Reason: {revision.reason}</p>
            </div>
          ))}
          {org.can("decision.write") ? (
            <ActionForm action={saveDecision} submitLabel="Save a new revision">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="decisionId" value={revisions[0].id} />
              <input type="hidden" name="title" value={revisions.at(-1)?.title} />
              <label className="field">Status
                <select name="status" defaultValue={revisions[0].status}>{["proposed", "accepted", "superseded", "rejected"].map((item) => <option key={item}>{item}</option>)}</select>
              </label>
              <label className="field">Problem<textarea name="problem" defaultValue={revisions.at(-1)?.problem} required /></label>
              <label className="field">Options<textarea name="options" defaultValue={revisions.at(-1)?.options} /></label>
              <label className="field">Decision<textarea name="decision" defaultValue={revisions.at(-1)?.final_decision} required /></label>
              <label className="field">Reason<textarea name="reason" defaultValue={revisions.at(-1)?.reason} /></label>
              <label className="field">Date<input name="decided" type="date" defaultValue={revisions[0].decided_on ?? ""} /></label>
            </ActionForm>
          ) : null}
        </article>
      ))}
      {org.can("decision.write") ? (
        <div className="card">
          <h2 className="font-serif text-2xl">New decision</h2>
          <ActionForm action={saveDecision} submitLabel="Record decision">
            <input type="hidden" name="slug" value={slug} />
            <label className="field">Title<input name="title" required /></label>
            <label className="field">Status
              <select name="status">{["proposed", "accepted", "superseded", "rejected"].map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="field">Problem<textarea name="problem" required /></label>
            <label className="field">Options<textarea name="options" /></label>
            <label className="field">Decision<textarea name="decision" required /></label>
            <label className="field">Reason<textarea name="reason" /></label>
            <label className="field">Date<input name="decided" type="date" /></label>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
