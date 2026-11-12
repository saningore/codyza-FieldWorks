import { notFound } from "next/navigation";
import { rowsForStudent } from "@/lib/class-results";
import { courseGrade, type GradeCategory } from "@/lib/domain";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

type Submission = { id: string; assignment_id: string; user_id: string; attempt: number; submitted_at: string };
type Grade = { submission_id: string; score: string; excused: boolean; posted_at: string | null };
type Assignment = { id: string; title: string; category_id: string | null; points: string; due_at: string | null };
type Student = { user_id: string; name: string };

export default async function GradebookPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "teacher" || !org.can("gradebook.read")) notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const sections = await tx<{ name: string; calculation: "total_points" | "weighted"; missing_counts_as_zero: boolean }[]>`
      select name, calculation, missing_counts_as_zero from sections where id = ${id}
    `;
    const categories = await tx<GradeCategory[]>`select id, weight, drop_lowest as "dropLowest" from categories where section_id = ${id}`;
    const assignments = await tx<Assignment[]>`
      select id, title, category_id, points, due_at::text from assignments where section_id = ${id} and published
    `;
    const students = await tx<Student[]>`
      select e.user_id, u.name from enrollments e join users u on u.id = e.user_id
      where e.section_id = ${id} and e.status = 'active' order by u.name
    `;
    const submissions = await tx<Submission[]>`
      select s.id, s.assignment_id, s.user_id, s.attempt, s.submitted_at::text
      from submissions s join assignments a on a.id = s.assignment_id
      where a.section_id = ${id}
    `;
    const grades = await tx<Grade[]>`
      select g.submission_id, g.score, g.excused, g.posted_at::text
      from grades g join submissions s on s.id = g.submission_id
      join assignments a on a.id = s.assignment_id
      where a.section_id = ${id}
    `;
    return { section: sections[0], categories, assignments, students, submissions, grades };
  });
  if (!data.section) notFound();
  const categories = data.categories.map((category) => ({ ...category, weight: Number(category.weight), dropLowest: Number(category.dropLowest) }));
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">{data.section.name} gradebook</h1>
      <p>Overall grades use posted scores only. A weighted category with nothing posted blocks the overall instead of being dropped from the math.</p>
      {data.students.length === 0 ? <p>No active students.</p> : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-line p-2 text-left">Student</th>
              {data.assignments.map((assignment) => <th key={assignment.id} className="border-b border-line p-2 text-left">{assignment.title}</th>)}
              <th className="border-b border-line p-2 text-left">Overall</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((student) => {
              const result = courseGrade({
                mode: data.section.calculation,
                categories,
                items: rowsForStudent(student.user_id, data.assignments, data.submissions, data.grades, data.section.missing_counts_as_zero),
                missingCountsAsZero: data.section.missing_counts_as_zero,
              });
              return (
                <tr key={student.user_id}>
                  <td className="border-b border-line p-2">{student.name}</td>
                  {data.assignments.map((assignment) => {
                    const attempts = data.submissions.filter((submission) => submission.assignment_id === assignment.id && submission.user_id === student.user_id);
                    const latest = attempts.sort((a, b) => b.attempt - a.attempt)[0];
                    const grade = latest ? data.grades.find((item) => item.submission_id === latest.id) : undefined;
                    return <td key={assignment.id} className="border-b border-line p-2">{grade?.posted_at ? (grade.excused ? "Excused" : grade.score) : latest ? "Not posted" : "Missing"}</td>;
                  })}
                  <td className="border-b border-line p-2">{result.overall == null ? result.reason : `${result.overall}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
