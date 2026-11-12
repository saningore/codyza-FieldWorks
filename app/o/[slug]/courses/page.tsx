import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { gpa, recordedCourseGrade } from "@/lib/domain";
import { createStudyCourse, createStudyTerm } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

const scale = [
  { min: 90, points: 4 },
  { min: 80, points: 3 },
  { min: 70, points: 2 },
  { min: 60, points: 1 },
  { min: 0, points: 0 },
];

export default async function CoursesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "student") notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const terms = await tx<{ id: string; name: string }[]>`select id, name from study_terms order by name`;
    const courses = await tx<{ id: string; name: string; credits: string; include_in_gpa: boolean; term_id: string | null }[]>`
      select id, name, credits, include_in_gpa, term_id from study_courses order by name
    `;
    const assessments = await tx<{ course_id: string; weight: string; points_possible: string; points_earned: string | null; status: string }[]>`
      select course_id, weight, points_possible, points_earned, status from study_assessments
    `;
    return { terms, courses, assessments };
  });
  const graded = data.courses.map((course) => {
    const grade = recordedCourseGrade(data.assessments.filter((item) => item.course_id === course.id).map((item) => ({
      weight: Number(item.weight),
      earned: item.points_earned == null ? null : Number(item.points_earned),
      possible: Number(item.points_possible),
      status: item.status,
    })));
    return { ...course, percent: grade.percent };
  });
  const termGpa = gpa(graded.map((course) => ({ credits: Number(course.credits), percent: course.percent, include: course.include_in_gpa })), scale);
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Courses</h1>
      <p>{termGpa == null ? "No GPA yet. A course counts after you record a returned grade and credits." : `GPA ${termGpa} from graded credits on your scale.`}</p>
      {graded.length === 0 ? <p>No courses yet.</p> : graded.map((course) => (
        <article key={course.id} className="card">
          <Link className="font-serif text-2xl text-field underline" href={`/o/${slug}/courses/${course.id}`}>{course.name}</Link>
          <p>{course.percent == null ? "No graded work recorded." : `${course.percent}% recorded`}</p>
        </article>
      ))}
      <div className="card">
        <h2 className="font-serif text-2xl">Term</h2>
        <ActionForm action={createStudyTerm} submitLabel="Add term">
          <input type="hidden" name="slug" value={slug} />
          <label className="field">Name<input name="name" required /></label>
          <label className="field">Starts<input name="starts" type="date" /></label>
          <label className="field">Ends<input name="ends" type="date" /></label>
        </ActionForm>
      </div>
      <div className="card">
        <h2 className="font-serif text-2xl">Course</h2>
        <ActionForm action={createStudyCourse} submitLabel="Add course">
          <input type="hidden" name="slug" value={slug} />
          <label className="field">Term
            <select name="termId"><option value="">None</option>{data.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select>
          </label>
          <label className="field">Name<input name="name" required /></label>
          <label className="field">Instructor<input name="instructor" /></label>
          <label className="field">Credits<input name="credits" type="number" min="0" step="0.5" defaultValue="3" /></label>
          <label className="field">Room<input name="room" /></label>
        </ActionForm>
      </div>
    </div>
  );
}
