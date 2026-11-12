import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { saveAttendance } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function AttendancePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "teacher" || !org.can("attendance.write") && !org.can("gradebook.read")) notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const sections = await tx<{ name: string }[]>`select name from sections where id = ${id}`;
    const students = await tx<{ user_id: string; name: string }[]>`
      select e.user_id, u.name from enrollments e join users u on u.id = e.user_id
      where e.section_id = ${id} and e.status = 'active' order by u.name
    `;
    const sessions = await tx<{ id: string; meeting_on: string }[]>`
      select id, meeting_on::text from attendance_sessions where section_id = ${id} order by meeting_on
    `;
    const marks = await tx<{ session_id: string; status: string }[]>`
      select session_id, status from attendance_marks where session_id in (select id from attendance_sessions where section_id = ${id})
    `;
    return { section: sections[0], students, sessions, marks };
  });
  if (!data.section) notFound();
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">{data.section.name} attendance</h1>
      <p>A mark exists only for a meeting someone opened. Empty days are not counted as absences.</p>
      {data.sessions.length === 0 ? <p>No attendance sessions recorded.</p> : (
        <ul>
          {data.sessions.map((session) => {
            const counts = data.marks.filter((mark) => mark.session_id === session.id);
            return <li key={session.id}>{session.meeting_on}: {counts.length} marks stored</li>;
          })}
        </ul>
      )}
      {org.can("attendance.write") ? (
        <div className="card">
          <h2 className="font-serif text-2xl">Record a meeting</h2>
          <ActionForm action={saveAttendance} submitLabel="Save attendance">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="sectionId" value={id} />
            <label className="field">Meeting date<input name="meeting" type="date" required /></label>
            {data.students.map((student) => (
              <label key={student.user_id} className="field">{student.name}
                <select name={`mark_${student.user_id}`} defaultValue="present">
                  <option>present</option>
                  <option>absent</option>
                  <option>tardy</option>
                  <option>excused</option>
                </select>
              </label>
            ))}
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
