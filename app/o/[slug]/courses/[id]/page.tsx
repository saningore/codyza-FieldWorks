import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { recordedCourseGrade } from "@/lib/domain";
import { createAssessment } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function StudyCoursePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "student") notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const courses = await tx<{ id: string; name: string; instructor: string; room: string }[]>`
      select id, name, instructor, room from study_courses where id = ${id}
    `;
    const assessments = await tx<{ title: string; weight: string; points_possible: string; points_earned: string | null; status: string; kind: string }[]>`
      select title, weight, points_possible, points_earned, status, kind from study_assessments where course_id = ${id}
    `;
    const meetings = await tx<{ weekday: number; start_time: string; end_time: string }[]>`
      select weekday, start_time, end_time from study_meetings where course_id = ${id}
    `;
    return { course: courses[0], assessments, meetings };
  });
  if (!data.course) notFound();
  const grade = recordedCourseGrade(data.assessments.map((item) => ({
    weight: Number(item.weight),
    earned: item.points_earned == null ? null : Number(item.points_earned),
    possible: Number(item.points_possible),
    status: item.status,
  })));
  const covered = grade.weightTotal > 0 ? Math.round((grade.weightCovered / grade.weightTotal) * 100) : 0;
  const weightSum = data.assessments.filter((item) => item.status !== "excused").reduce((sum, item) => sum + Number(item.weight), 0);
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">{data.course.name}</h1>
      <p>{data.course.instructor} · {data.course.room}</p>
      <p>{grade.percent == null ? "No graded work recorded." : `${grade.percent}% based on ${covered}% of the weight you have recorded.`}</p>
      {weightSum !== 100 ? <p>The weights you entered sum to {weightSum}, not 100. The average still uses only graded rows.</p> : null}
      <ul>{data.assessments.map((item) => <li key={item.title}>{item.kind}: {item.title} · weight {item.weight} · {item.status}</li>)}</ul>
      {data.meetings.length === 0 ? <p>No weekly meeting stored.</p> : data.meetings.map((meeting) => <p key={meeting.weekday}>Weekday {meeting.weekday}: {meeting.start_time}–{meeting.end_time}</p>)}
      <div className="card">
        <ActionForm action={createAssessment} submitLabel="Add assessment">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="courseId" value={id} />
          <label className="field">Title<input name="title" required /></label>
          <label className="field">Kind
            <select name="kind"><option>homework</option><option>quiz</option><option>exam</option><option>project</option></select>
          </label>
          <label className="field">Due<input name="due" type="datetime-local" /></label>
          <label className="field">Weight<input name="weight" type="number" min="0" defaultValue="0" /></label>
          <label className="field">Points possible<input name="possible" type="number" min="1" defaultValue="100" /></label>
          <label className="field">Points earned<input name="earned" type="number" min="0" /></label>
          <label className="field">Status
            <select name="status"><option>not_started</option><option>in_progress</option><option>submitted</option><option>graded</option><option>excused</option></select>
          </label>
        </ActionForm>
      </div>
    </div>
  );
}
