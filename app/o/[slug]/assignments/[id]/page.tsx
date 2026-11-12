import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { formatWhen } from "@/lib/format";
import { gradeSubmission, submitWork } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function AssignmentPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "teacher") notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const assignments = await tx<{ id: string; title: string; points: string; due_at: string | null; published: boolean; section_id: string }[]>`
      select id, title, points, due_at::text, published, section_id from assignments where id = ${id}
    `;
    const submissions = await tx<{ id: string; user_id: string; attempt: number; body: string; submitted_at: string; name: string }[]>`
      select s.id, s.user_id, s.attempt, s.body, s.submitted_at::text, u.name
      from submissions s join users u on u.id = s.user_id
      where s.assignment_id = ${id}
      order by u.name, s.attempt
    `;
    const grades = await tx<{ submission_id: string; score: string; feedback: string; posted_at: string | null; excused: boolean; points_deducted: string }[]>`
      select g.submission_id, g.score, g.feedback, g.posted_at::text, g.excused, g.points_deducted
      from grades g join submissions s on s.id = g.submission_id
      where s.assignment_id = ${id}
    `;
    return { assignment: assignments[0], submissions, grades };
  });
  if (!data.assignment) notFound();
  if (!data.assignment.published && !org.can("class.write")) notFound();
  const mine = data.submissions.filter((submission) => submission.user_id === org.userId);
  const visible = org.can("gradebook.read") ? data.submissions : mine;
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">{data.assignment.title}</h1>
      <p>{data.assignment.points} points. {data.assignment.due_at ? `Due ${formatWhen(data.assignment.due_at, org.timezone)}.` : "No due time."}</p>
      {org.can("assignment.submit") && data.assignment.published ? (
        <div className="card">
          <h2 className="font-serif text-2xl">Submit work</h2>
          <ActionForm action={submitWork} submitLabel="Submit">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="assignmentId" value={id} />
            <label className="field">Your work<textarea name="body" required /></label>
          </ActionForm>
        </div>
      ) : null}
      <section className="card">
        <h2 className="font-serif text-2xl">Attempts</h2>
        {visible.length === 0 ? <p>No submissions stored.</p> : visible.map((submission) => {
          const grade = data.grades.find((item) => item.submission_id === submission.id);
          const late = data.assignment.due_at ? Date.parse(submission.submitted_at) > Date.parse(data.assignment.due_at) : false;
          const showGrade = org.can("gradebook.read") || (grade?.posted_at && submission.user_id === org.userId);
          return (
            <article key={submission.id} className="mt-3 border-t border-line pt-3">
              <p>{org.can("gradebook.read") ? submission.name : "Your attempt"} · attempt {submission.attempt}</p>
              <p>Submitted {formatWhen(submission.submitted_at, org.timezone)}{late ? " · Late" : ""}</p>
              <p>{submission.body}</p>
              {showGrade && grade ? <p>{grade.excused ? "Excused" : `Score ${grade.score}`}{grade.posted_at ? "" : " · draft"}{grade.feedback ? ` · ${grade.feedback}` : ""}</p> : null}
              {org.can("grade.write") ? (
                <ActionForm action={gradeSubmission} submitLabel="Save grade">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="assignmentId" value={id} />
                  <input type="hidden" name="submissionId" value={submission.id} />
                  <label className="field">Score<input name="score" type="number" min="0" step="0.5" defaultValue={grade?.score ?? ""} required /></label>
                  <label className="field">Feedback<textarea name="feedback" defaultValue={grade?.feedback ?? ""} /></label>
                  <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="excused" defaultChecked={grade?.excused} /> Excused</label>
                  <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="posted" defaultChecked={Boolean(grade?.posted_at)} /> Posted to the student</label>
                </ActionForm>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}
