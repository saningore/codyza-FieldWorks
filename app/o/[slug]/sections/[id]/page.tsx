import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { announce, createAssignment, enrollStudent } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function SectionPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "teacher") notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const sections = await tx<{ id: string; name: string; schedule: string; room: string; term_name: string }[]>`
      select id, name, schedule, room, term_name from sections where id = ${id}
    `;
    const assignments = await tx<{ id: string; title: string; points: string; due_at: string | null; published: boolean }[]>`
      select id, title, points, due_at::text, published from assignments where section_id = ${id} order by due_at nulls last
    `;
    const categories = await tx<{ id: string; name: string; weight: string }[]>`
      select id, name, weight from categories where section_id = ${id}
    `;
    const roster = org.can("gradebook.read") || org.can("class.write")
      ? await tx<{ user_id: string; name: string; status: string }[]>`
          select e.user_id, u.name, e.status from enrollments e join users u on u.id = e.user_id
          where e.section_id = ${id} order by u.name
        `
      : [];
    const announcements = await tx<{ body: string; created_at: string }[]>`
      select body, created_at::text from announcements where section_id = ${id} order by created_at desc
    `;
    const resources = await tx<{ title: string; url: string }[]>`select title, url from resources where section_id = ${id}`;
    const candidates = org.can("class.write")
      ? await tx<{ id: string; name: string }[]>`
          select u.id, u.name from memberships m join users u on u.id = m.user_id
          where m.role = 'student' and m.status = 'active'
            and not exists (select 1 from enrollments e where e.section_id = ${id} and e.user_id = u.id)
        `
      : [];
    return { section: sections[0], assignments, categories, roster, announcements, resources, candidates };
  });
  if (!data.section) notFound();
  const visibleAssignments = data.assignments.filter((assignment) => assignment.published || org.can("class.write"));
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-serif text-4xl">{data.section.name}</h1>
        <p>{data.section.term_name} · {data.section.schedule} · {data.section.room}</p>
        {org.can("gradebook.read") ? (
          <p className="mt-2 flex flex-wrap gap-3">
            <Link className="font-bold text-field underline" href={`/o/${slug}/sections/${id}/gradebook`}>Gradebook</Link>
            <Link className="font-bold text-field underline" href={`/o/${slug}/sections/${id}/attendance`}>Attendance</Link>
            <Link className="font-bold text-field underline" href={`/o/${slug}/sections/${id}/analytics`}>Analytics</Link>
          </p>
        ) : null}
      </div>
      <section className="card">
        <h2 className="font-serif text-2xl">Assignments</h2>
        {visibleAssignments.length === 0 ? <p>No published assignments.</p> : (
          <ul>{visibleAssignments.map((assignment) => (
            <li key={assignment.id}>
              <Link className="font-bold text-field underline" href={`/o/${slug}/assignments/${assignment.id}`}>{assignment.title}</Link>
              {" "}· {assignment.points} points {assignment.published ? "" : "· draft"}
            </li>
          ))}</ul>
        )}
      </section>
      {data.roster.length > 0 ? (
        <section className="card">
          <h2 className="font-serif text-2xl">Roster</h2>
          <ul>{data.roster.map((student) => <li key={student.user_id}>{student.name} · {student.status}</li>)}</ul>
        </section>
      ) : null}
      <section className="card">
        <h2 className="font-serif text-2xl">Announcements</h2>
        {data.announcements.length === 0 ? <p>No announcements.</p> : data.announcements.map((item) => <p key={item.created_at}>{item.body}</p>)}
        {org.can("class.write") ? (
          <ActionForm action={announce} submitLabel="Post announcement">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="sectionId" value={id} />
            <label className="field">Announcement<textarea name="body" required /></label>
          </ActionForm>
        ) : null}
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Resources</h2>
        {data.resources.length === 0 ? <p>No resources.</p> : data.resources.map((item) => <p key={item.title}>{item.title}{item.url ? ` · ${item.url}` : ""}</p>)}
      </section>
      {org.can("class.write") ? (
        <>
          <div className="card">
            <h2 className="font-serif text-2xl">New assignment</h2>
            <ActionForm action={createAssignment} submitLabel="Create assignment">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="sectionId" value={id} />
              <label className="field">Title<input name="title" required /></label>
              <label className="field">Points<input name="points" type="number" min="1" step="0.5" required /></label>
              <label className="field">Due<input name="due" type="datetime-local" /></label>
              <label className="field">Category
                <select name="categoryId">{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.weight}%)</option>)}</select>
              </label>
              <label className="field">Late percent per day<input name="latePercent" type="number" min="0" defaultValue="0" /></label>
              <label className="field">Late cap percent<input name="lateCap" type="number" min="0" defaultValue="0" /></label>
              <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="published" /> Published</label>
            </ActionForm>
          </div>
          {data.candidates.length > 0 ? (
            <div className="card">
              <h2 className="font-serif text-2xl">Enroll a student</h2>
              <ActionForm action={enrollStudent} submitLabel="Enroll">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="sectionId" value={id} />
                <label className="field">Student
                  <select name="userId">{data.candidates.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
                </label>
              </ActionForm>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
