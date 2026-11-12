import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { createCourseSection } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function SectionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "teacher") notFound();
  const sections = await withOrg(org.userId, org.orgId, (tx) => tx<{ id: string; name: string; term_name: string }[]>`
    select id, name, term_name from sections order by name
  `);
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Classes</h1>
      {sections.length === 0 ? <p>No classes yet.</p> : (
        <ul className="grid gap-3">
          {sections.map((section) => (
            <li key={section.id} className="card">
              <Link className="font-serif text-2xl text-field underline" href={`/o/${slug}/sections/${section.id}`}>{section.name}</Link>
              <p>{section.term_name}</p>
            </li>
          ))}
        </ul>
      )}
      {org.can("class.write") ? (
        <div className="card">
          <h2 className="font-serif text-2xl">New class</h2>
          <ActionForm action={createCourseSection} submitLabel="Create class">
            <input type="hidden" name="slug" value={slug} />
            <label className="field">Course<input name="course" required /></label>
            <label className="field">Class<input name="section" required /></label>
            <label className="field">Term<input name="term" /></label>
            <label className="field">Schedule<input name="schedule" /></label>
            <label className="field">Room<input name="room" /></label>
            <label className="field">Calculation
              <select name="calculation"><option value="total_points">Total points</option><option value="weighted">Weighted categories</option></select>
            </label>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
