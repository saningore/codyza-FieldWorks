import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Bars } from "@/components/bars";
import { studyMinutes } from "@/lib/domain";
import { logStudy } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function WeekPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "student") notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const meetings = await tx<{ weekday: number; start_time: string; end_time: string; name: string }[]>`
      select m.weekday, m.start_time, m.end_time, c.name from study_meetings m join study_courses c on c.id = m.course_id order by m.weekday
    `;
    const due = await tx<{ title: string; due_at: string; name: string }[]>`
      select a.title, a.due_at::text, c.name from study_assessments a join study_courses c on c.id = a.course_id
      where a.due_at is not null and a.due_at < now() + interval '7 days' and a.due_at > now() - interval '1 day'
      order by a.due_at
    `;
    const sessions = await tx<{ name: string | null; started_at: string; ended_at: string | null; confirmed: boolean }[]>`
      select c.name, s.started_at::text, s.ended_at::text, s.confirmed
      from study_sessions s left join study_courses c on c.id = s.course_id
    `;
    const courses = await tx<{ id: string; name: string }[]>`select id, name from study_courses order by name`;
    return { meetings, due, sessions, courses };
  });
  const minutes = new Map<string, number>();
  for (const session of data.sessions) {
    const value = studyMinutes(session.started_at, session.ended_at, session.confirmed);
    if (value == null || !session.name) continue;
    minutes.set(session.name, (minutes.get(session.name) ?? 0) + value);
  }
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">This week</h1>
      <section className="card">
        <h2 className="font-serif text-2xl">Timetable</h2>
        {data.meetings.length === 0 ? <p>No weekly meetings stored.</p> : data.meetings.map((meeting) => (
          <p key={`${meeting.name}-${meeting.weekday}`}>{days[meeting.weekday]} · {meeting.name} · {meeting.start_time}–{meeting.end_time}</p>
        ))}
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Due soon</h2>
        {data.due.length === 0 ? <p>Nothing you recorded is due in the next seven days.</p> : data.due.map((item) => <p key={item.title}>{item.name}: {item.title}</p>)}
      </section>
      <Bars title="Study minutes" caption="Completed sessions with a start and an end." unit="minutes" empty="No completed study session." rows={[...minutes.entries()].map(([label, value]) => ({ label, value }))} />
      <div className="card">
        <h2 className="font-serif text-2xl">Log a session</h2>
        <ActionForm action={logStudy} submitLabel="Save session">
          <input type="hidden" name="slug" value={slug} />
          <label className="field">Course
            <select name="courseId">{data.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select>
          </label>
          <label className="field">Started<input name="started" type="datetime-local" required /></label>
          <label className="field">Ended<input name="ended" type="datetime-local" required /></label>
          <label className="field">Method
            <select name="method"><option>read</option><option>practice</option><option>review</option></select>
          </label>
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="confirmed" /> This session is longer than four hours and I confirm it</label>
        </ActionForm>
      </div>
    </div>
  );
}
