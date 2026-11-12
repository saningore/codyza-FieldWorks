import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { addComment, updateIssue } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function IssuePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "engineer") notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const issues = await tx<{ id: string; number: number; title: string; description: string; priority: string; status: string; deadline: string | null; start_on: string | null; end_on: string | null; assignee_id: string | null }[]>`
      select id, number, title, description, priority, status, deadline::text, start_on::text, end_on::text, assignee_id from issues where id = ${id}
    `;
    const revisions = await tx<{ created_at: string; description: string }[]>`
      select created_at::text, description from issue_revisions where issue_id = ${id} order by created_at
    `;
    const comments = await tx<{ body: string; created_at: string; name: string }[]>`
      select c.body, c.created_at::text, u.name from comments c join users u on u.id = c.author_id
      where c.subject_type = 'issue' and c.subject_id = ${id} order by c.created_at
    `;
    const members = await tx<{ id: string; name: string }[]>`
      select u.id, u.name from memberships m join users u on u.id = m.user_id
      where m.organization_id = ${org.orgId} and m.status = 'active'
    `;
    return { issue: issues[0], revisions, comments, members };
  });
  if (!data.issue) notFound();
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">ENG-{data.issue.number} {data.issue.title}</h1>
      <p>{data.issue.priority} · {data.issue.status}</p>
      <p>{data.issue.description}</p>
      <section className="card">
        <h2 className="font-serif text-2xl">Description history</h2>
        <ul>{data.revisions.map((revision) => <li key={revision.created_at}>{revision.description}</li>)}</ul>
      </section>
      {org.can("issue.write") ? (
        <div className="card">
          <ActionForm action={updateIssue} submitLabel="Update issue">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="issueId" value={id} />
            <label className="field">Description<textarea name="description" defaultValue={data.issue.description} /></label>
            <label className="field">Priority
              <select name="priority" defaultValue={data.issue.priority}>{["none", "low", "medium", "high", "urgent"].map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="field">Status
              <select name="status" defaultValue={data.issue.status}>{["backlog", "unstarted", "started", "completed", "canceled"].map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="field">Assignee
              <select name="assignee" defaultValue={data.issue.assignee_id ?? ""}>
                <option value="">Unassigned</option>
                {data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </label>
            <label className="field">Deadline<input name="deadline" type="date" defaultValue={data.issue.deadline ?? ""} /></label>
            <label className="field">Start<input name="start" type="date" defaultValue={data.issue.start_on ?? ""} /></label>
            <label className="field">End<input name="end" type="date" defaultValue={data.issue.end_on ?? ""} /></label>
          </ActionForm>
        </div>
      ) : null}
      <section className="card">
        <h2 className="font-serif text-2xl">Comments</h2>
        {data.comments.length === 0 ? <p>No comments.</p> : data.comments.map((comment) => <p key={comment.created_at}><strong>{comment.name}.</strong> {comment.body}</p>)}
        <ActionForm action={addComment} submitLabel="Comment">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="subjectType" value="issue" />
          <input type="hidden" name="subjectId" value={id} />
          <label className="field">Comment<textarea name="body" required /></label>
        </ActionForm>
      </section>
    </div>
  );
}
