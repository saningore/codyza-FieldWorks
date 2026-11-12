import { notFound } from "next/navigation";
import { Bars } from "@/components/bars";
import { rowsForStudent } from "@/lib/class-results";
import { completionRate, courseGrade } from "@/lib/domain";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function AnalyticsPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "teacher" || !org.can("gradebook.read")) notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const sections = await tx<{ name: string; calculation: "total_points" | "weighted"; missing_counts_as_zero: boolean }[]>`
      select name, calculation, missing_counts_as_zero from sections where id = ${id}
    `;
    const categories = await tx<{ id: string; weight: string; dropLowest: number }[]>`
      select id, weight, drop_lowest as "dropLowest" from categories where section_id = ${id}
    `;
    const assignments = await tx<{ id: string; title: string; category_id: string | null; points: string; due_at: string | null }[]>`
      select id, title, category_id, points, due_at::text from assignments where section_id = ${id} and published order by due_at
    `;
    const students = await tx<{ user_id: string; name: string }[]>`
      select e.user_id, u.name from enrollments e join users u on u.id = e.user_id
      where e.section_id = ${id} and e.status = 'active'
    `;
    const submissions = await tx<{ id: string; assignment_id: string; user_id: string; attempt: number; submitted_at: string }[]>`
      select s.id, s.assignment_id, s.user_id, s.attempt, s.submitted_at::text
      from submissions s join assignments a on a.id = s.assignment_id where a.section_id = ${id}
    `;
    const grades = await tx<{ submission_id: string; score: string; excused: boolean; posted_at: string | null }[]>`
      select g.submission_id, g.score, g.excused, g.posted_at::text
      from grades g join submissions s on s.id = g.submission_id join assignments a on a.id = s.assignment_id
      where a.section_id = ${id}
    `;
    const marks = await tx<{ meeting_on: string; status: string }[]>`
      select sess.meeting_on::text, m.status
      from attendance_marks m join attendance_sessions sess on sess.id = m.session_id
      where sess.section_id = ${id}
    `;
    return { section: sections[0], categories, assignments, students, submissions, grades, marks };
  });
  if (!data.section) notFound();
  const categories = data.categories.map((category) => ({ id: category.id, weight: Number(category.weight), dropLowest: Number(category.dropLowest) }));
  const past = data.assignments.filter((assignment) => assignment.due_at && Date.parse(assignment.due_at) < Date.now());
  const completion = past.map((assignment) => {
    const submitted = new Set(data.submissions.filter((submission) => submission.assignment_id === assignment.id).map((submission) => submission.user_id)).size;
    const rate = completionRate(data.students.length, submitted);
    return { label: assignment.title, value: rate == null ? 0 : Math.round(rate * 100), known: rate != null, submitted, enrolled: data.students.length };
  });
  const overalls = data.students.flatMap((student) => {
    const result = courseGrade({
      mode: data.section.calculation,
      categories,
      items: rowsForStudent(student.user_id, data.assignments, data.submissions, data.grades, data.section.missing_counts_as_zero),
      missingCountsAsZero: data.section.missing_counts_as_zero,
    });
    return result.overall == null ? [] : [result.overall];
  });
  const buckets = [0, 60, 70, 80, 90].map((floor, index, all) => {
    const ceiling = all[index + 1] ?? 101;
    return { label: floor === 90 ? "90-100" : `${floor}-${ceiling - 1}`, value: overalls.filter((score) => score >= floor && score < ceiling).length };
  });
  const performance = past.map((assignment) => {
    const scores = data.students.flatMap((student) => {
      const latest = data.submissions.filter((submission) => submission.assignment_id === assignment.id && submission.user_id === student.user_id).sort((a, b) => b.attempt - a.attempt)[0];
      const grade = latest ? data.grades.find((item) => item.submission_id === latest.id && item.posted_at && !item.excused) : undefined;
      if (!grade) return [];
      return [(Number(grade.score) / Number(assignment.points)) * 100];
    });
    return { label: assignment.title, value: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0, scores: scores.length };
  }).filter((row) => row.scores > 0);
  const attendance = ["present", "absent", "tardy", "excused"].map((status) => ({
    label: status,
    value: data.marks.filter((mark) => mark.status === status).length,
  })).filter((row) => row.value > 0);
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">{data.section.name} analytics</h1>
      <p>These figures use stored enrollments, attempts, posted grades, and opened attendance sessions.</p>
      <section className="card">
        <h2 className="font-serif text-2xl">Assignment completion</h2>
        {completion.length === 0 ? <p>No published assignment is past due.</p> : completion.map((row) => (
          <p key={row.label}>{row.label}: {row.known ? `${row.submitted} of ${row.enrolled}` : "No active students"}</p>
        ))}
      </section>
      {overalls.length === 0 ? <p>No posted grades for this section.</p> : (
        <Bars title="Grade distribution" caption="Count of students with an overall grade, by band." unit="students" empty="No posted grades for this section." rows={buckets.filter((row) => row.value > 0)} />
      )}
      <Bars title="Attendance" caption="Marks on sessions that were opened." unit="marks" empty="No attendance sessions recorded." rows={attendance} />
      <Bars title="Class performance over time" caption="Mean posted percentage by assignment." unit="percent" empty="No assignment averages yet." rows={performance.map(({ label, value }) => ({ label, value }))} />
    </div>
  );
}
