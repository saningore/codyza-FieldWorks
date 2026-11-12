import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { milestoneProgress } from "@/lib/domain";
import { createIssue, createMilestone, saveDocument } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "engineer") notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const projects = await tx<{ id: string; name: string; summary: string; status: string; site_name: string | null }[]>`
      select id, name, summary, status, site_name from projects where id = ${id}
    `;
    const issues = await tx<{ id: string; number: number; title: string; status: string; priority: string; milestone_id: string | null }[]>`
      select id, number, title, status, priority, milestone_id from issues where project_id = ${id} order by number
    `;
    const milestones = await tx<{ id: string; name: string; target_on: string | null }[]>`
      select id, name, target_on::text from milestones where project_id = ${id} order by target_on nulls last
    `;
    const documents = await tx<{ id: string; title: string; revision: number; body: string }[]>`
      select d.id, d.title, r.revision, r.body
      from documents d
      join lateral (
        select revision, body from document_revisions where document_id = d.id order by revision desc limit 1
      ) r on true
      where d.project_id = ${id}
    `;
    const members = await tx<{ id: string; name: string }[]>`
      select u.id, u.name from memberships m join users u on u.id = m.user_id
      where m.organization_id = ${org.orgId} and m.status = 'active' order by u.name
    `;
    return { project: projects[0], issues, milestones, documents, members };
  });
  if (!data.project) notFound();
  const progress = milestoneProgress(data.issues.map((issue) => issue.status));
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-serif text-4xl">{data.project.name}</h1>
        <p>{data.project.summary}</p>
        <p>Status {data.project.status}. Issues: {progress.label}.</p>
        <p>{data.project.site_name ? `Site: ${data.project.site_name}` : "No site recorded."}</p>
      </div>
      <section className="card">
        <h2 className="font-serif text-2xl">Issues</h2>
        {data.issues.length === 0 ? <p>No issues yet.</p> : (
          <ul>{data.issues.map((issue) => (
            <li key={issue.id}><Link className="font-bold text-field underline" href={`/o/${slug}/issues/${issue.id}`}>ENG-{issue.number} {issue.title}</Link> · {issue.priority} · {issue.status}</li>
          ))}</ul>
        )}
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Milestones</h2>
        {data.milestones.length === 0 ? <p>No milestones.</p> : data.milestones.map((milestone) => {
          const linked = milestoneProgress(data.issues.filter((issue) => issue.milestone_id === milestone.id).map((issue) => issue.status));
          return <p key={milestone.id}>{milestone.name}: {linked.label}</p>;
        })}
        {org.can("project.write") ? (
          <ActionForm action={createMilestone} submitLabel="Add milestone">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="projectId" value={id} />
            <label className="field">Name<input name="name" required /></label>
            <label className="field">Target<input name="target" type="date" /></label>
          </ActionForm>
        ) : null}
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Documents</h2>
        {data.documents.length === 0 ? <p>No documents.</p> : data.documents.map((document) => (
          <article key={document.id}><h3 className="font-bold">{document.title}</h3><p>Revision {document.revision}</p><p>{document.body}</p></article>
        ))}
        {org.can("project.write") ? (
          <ActionForm action={saveDocument} submitLabel="Save document">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="projectId" value={id} />
            <label className="field">Title<input name="title" required /></label>
            <label className="field">Body<textarea name="body" required /></label>
          </ActionForm>
        ) : null}
      </section>
      {org.can("issue.write") ? (
        <div className="card">
          <h2 className="font-serif text-2xl">New issue</h2>
          <ActionForm action={createIssue} submitLabel="Open issue">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="projectId" value={id} />
            <label className="field">Title<input name="title" required /></label>
            <label className="field">Description<textarea name="description" /></label>
            <label className="field">Priority
              <select name="priority">{["none", "low", "medium", "high", "urgent"].map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="field">Status
              <select name="status">{["backlog", "unstarted", "started", "completed", "canceled"].map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="field">Assignee
              <select name="assignee"><option value="">Unassigned</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
            </label>
            <label className="field">Milestone
              <select name="milestone"><option value="">None</option>{data.milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name}</option>)}</select>
            </label>
            <label className="field">Deadline<input name="deadline" type="date" /></label>
            <label className="field">Start<input name="start" type="date" /></label>
            <label className="field">End<input name="end" type="date" /></label>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
