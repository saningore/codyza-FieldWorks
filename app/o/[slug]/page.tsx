import Link from "next/link";
import { fieldEconomics, fieldStatus, milestoneProgress, recordedCourseGrade, reiUntil, studyMinutes } from "@/lib/domain";
import { formatDay, money } from "@/lib/format";
import { requireOrg } from "@/server/context";
import { withOrg, withUser } from "@/server/db";

export default async function OverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Overview</h1>
      {org.kind === "farmer" ? <Farmer orgId={org.orgId} userId={org.userId} slug={slug} today={today} finance={org.can("finance.read")} timezone={org.timezone} /> : null}
      {org.kind === "engineer" ? <Engineer orgId={org.orgId} userId={org.userId} slug={slug} /> : null}
      {org.kind === "teacher" ? <Teacher orgId={org.orgId} userId={org.userId} slug={slug} role={org.role} /> : null}
      {org.kind === "student" ? <Student orgId={org.orgId} userId={org.userId} /> : null}
      {org.kind === "practice" ? <Practice orgId={org.orgId} userId={org.userId} finance={org.can("client.write")} /> : null}
    </div>
  );
}

async function Farmer({ orgId, userId, slug, today, finance, timezone }: { orgId: string; userId: string; slug: string; today: string; finance: boolean; timezone: string }) {
  const data = await withOrg(userId, orgId, async (tx) => {
    const fields = await tx<{ id: string; name: string; stated_acres: string; status_override: string | null; crop: string | null; expected_harvest_on: string | null }[]>`
      select f.id, f.name, f.stated_acres, f.status_override, s.crop, s.expected_harvest_on::text
      from fields f
      left join crop_seasons s on s.field_id = f.id
      order by f.name
    `;
    const flags = await tx<{ field_id: string; kind: string }[]>`
      select field_id, kind from activities where status = 'done' and kind in ('planting', 'harvest')
    `;
    const upcoming = await tx<{ kind: string; target_on: string; field_name: string }[]>`
      select a.kind, a.target_on::text, f.name as field_name
      from activities a join fields f on f.id = a.field_id
      where a.status = 'planned' and a.target_on is not null and a.target_on <= current_date + 7
      order by a.target_on
    `;
    const loads = await tx<{ field_id: string; quantity: string; sale_price_cents: number | null }[]>`
      select field_id, quantity, sale_price_cents from activities where kind = 'harvest' and status = 'done'
    `;
    const expenses = finance
      ? await tx<{ amount_cents: number; spent_on: string }[]>`
          select amount_cents, spent_on::text from expenses where spent_on >= date_trunc('month', current_date)::date
        `
      : [];
    const restrictions = await tx<{ field_name: string; completed_on: string; rei_hours: number | null; phi_hours: number | null }[]>`
      select f.name as field_name, a.completed_on::text, a.rei_hours, a.phi_hours
      from activities a join fields f on f.id = a.field_id
      where a.kind = 'pesticide' and a.status = 'done'
    `;
    return { fields, flags, upcoming, loads, expenses, restrictions };
  });
  if (data.fields.length === 0) return <p>No fields yet. Add a farm, then a field, before the calendar or the charts have anything to sum.</p>;
  const missingPrice = data.loads.filter((load) => load.sale_price_cents == null).length;
  const monthCents = data.expenses.reduce((sum, row) => sum + Number(row.amount_cents), 0);
  return (
    <div className="grid gap-4">
      <ul className="grid gap-3 md:grid-cols-2">
        {data.fields.map((field) => {
          const status = fieldStatus({
            override: field.status_override,
            hasPlanting: data.flags.some((flag) => flag.field_id === field.id && flag.kind === "planting"),
            hasHarvest: data.flags.some((flag) => flag.field_id === field.id && flag.kind === "harvest"),
            expectedHarvest: field.expected_harvest_on,
            today,
          });
          const economics = fieldEconomics({
            acres: Number(field.stated_acres),
            loads: data.loads.filter((load) => load.field_id === field.id).map((load) => ({
              quantity: Number(load.quantity),
              salePriceCents: load.sale_price_cents,
            })),
            expenseCents: 0,
          });
          return (
            <li key={field.id} className="card">
              <Link className="font-serif text-2xl text-field underline" href={`/o/${slug}/fields/${field.id}`}>{field.name}</Link>
              <p>{field.crop ?? "No crop recorded"} · {status}</p>
              <p>{economics.yieldTotal} harvested on {field.stated_acres} stated acres.</p>
            </li>
          );
        })}
      </ul>
      <section className="card">
        <h2 className="font-serif text-2xl">Coming up</h2>
        {data.upcoming.length === 0 ? <p>No planned activities are due in the next seven days.</p> : (
          <ul>{data.upcoming.map((row) => <li key={`${row.field_name}-${row.target_on}-${row.kind}`}>{formatDay(row.target_on, timezone)} · {row.field_name} · {row.kind}</li>)}</ul>
        )}
      </section>
      {finance ? <p className="card">Expenses this month: {money(monthCents)}. This is the sum of expense rows dated this month.</p> : null}
      {missingPrice > 0 ? <p className="card">{missingPrice} load has no sale price. Margin stays blank until a price is recorded.</p> : null}
      <ul className="grid gap-2">
        {data.restrictions.map((row) => {
          const rei = reiUntil(row.completed_on, row.rei_hours);
          const phi = reiUntil(row.completed_on, row.phi_hours);
          if (!rei && !phi) return null;
          return <li key={`${row.field_name}-${row.completed_on}`} className="card">{row.field_name}: re-entry until {rei ?? "not recorded"}, harvest hold until {phi ?? "not recorded"}.</li>;
        })}
      </ul>
    </div>
  );
}

async function Engineer({ orgId, userId, slug }: { orgId: string; userId: string; slug: string }) {
  const rows = await withOrg(userId, orgId, async (tx) => {
    const projects = await tx<{ id: string; name: string }[]>`select id, name from projects order by name`;
    const issues = await tx<{ project_id: string; status: string; deadline: string | null; assignee_id: string | null; title: string }[]>`
      select project_id, status, deadline::text, assignee_id, title from issues
    `;
    const proposed = await tx<{ title: string }[]>`select title from decisions where status = 'proposed' order by title`;
    return { projects, issues, proposed };
  });
  if (rows.projects.length === 0) return <p>No projects yet. A new engineering workspace starts with an empty issue list.</p>;
  const today = new Date().toISOString().slice(0, 10);
  const mine = rows.issues.filter((issue) => issue.assignee_id === userId && issue.deadline && issue.deadline < today && issue.status !== "completed" && issue.status !== "canceled");
  return (
    <div className="grid gap-4">
      {rows.projects.map((project) => {
        const progress = milestoneProgress(rows.issues.filter((issue) => issue.project_id === project.id).map((issue) => issue.status));
        return (
          <article key={project.id} className="card">
            <Link className="font-serif text-2xl text-field underline" href={`/o/${slug}/projects/${project.id}`}>{project.name}</Link>
            <p>Issues: {progress.label}</p>
          </article>
        );
      })}
      <section className="card">
        <h2 className="font-serif text-2xl">Assigned to you and past deadline</h2>
        {mine.length === 0 ? <p>None.</p> : <ul>{mine.map((issue) => <li key={issue.title}>{issue.title}</li>)}</ul>}
      </section>
      <section className="card">
        <h2 className="font-serif text-2xl">Decisions still proposed</h2>
        {rows.proposed.length === 0 ? <p>None.</p> : <ul>{rows.proposed.map((row) => <li key={row.title}>{row.title}</li>)}</ul>}
      </section>
    </div>
  );
}

async function Teacher({ orgId, userId, slug, role }: { orgId: string; userId: string; slug: string; role: string }) {
  if (role === "student") {
    const work = await withUser(userId, (tx) => tx<{ assignment_title: string; section_name: string; due_at: string | null; submitted_at: string | null; score: string | null; points: string }[]>`
      select * from app.my_class_work()
    `);
    return (
      <section className="card">
        <h2 className="font-serif text-2xl">Your assignments</h2>
        {work.length === 0 ? <p>No published assignments are on your roster.</p> : (
          <ul className="grid gap-2">
            {work.map((row) => (
              <li key={row.assignment_title}>{row.section_name}: {row.assignment_title}. {row.submitted_at ? "Submitted." : "Not submitted."} {row.score != null ? `Posted score ${row.score} of ${row.points}.` : "No posted score."}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm">Class averages and other students' scores are not on this page.</p>
      </section>
    );
  }
  const sections = await withOrg(userId, orgId, (tx) => tx<{ id: string; name: string }[]>`select id, name from sections order by name`);
  if (sections.length === 0) return <p>No classes yet.</p>;
  return (
    <ul className="grid gap-3">
      {sections.map((section) => (
        <li key={section.id} className="card">
          <Link className="font-serif text-2xl text-field underline" href={`/o/${slug}/sections/${section.id}`}>{section.name}</Link>
        </li>
      ))}
    </ul>
  );
}

async function Student({ orgId, userId }: { orgId: string; userId: string }) {
  const data = await withOrg(userId, orgId, async (tx) => {
    const courses = await tx<{ id: string; name: string; credits: string; include_in_gpa: boolean }[]>`
      select id, name, credits, include_in_gpa from study_courses order by name
    `;
    const assessments = await tx<{ course_id: string; weight: string; points_possible: string; points_earned: string | null; status: string; title: string; due_at: string | null }[]>`
      select course_id, weight, points_possible, points_earned, status, title, due_at::text from study_assessments
    `;
    const sessions = await tx<{ course_id: string | null; started_at: string; ended_at: string | null; confirmed: boolean }[]>`
      select course_id, started_at::text, ended_at::text, confirmed from study_sessions
    `;
    return { courses, assessments, sessions };
  });
  const mirror = await withUser(userId, (tx) => tx<{ assignment_title: string; section_name: string; organization_name: string }[]>`
    select assignment_title, section_name, organization_name from app.my_class_work()
  `);
  if (data.courses.length === 0 && mirror.length === 0) {
    return <p>No courses yet. Add a term and a course before a grade or a study chart can be calculated.</p>;
  }
  return (
    <div className="grid gap-4">
      {data.courses.map((course) => {
        const grade = recordedCourseGrade(data.assessments.filter((item) => item.course_id === course.id).map((item) => ({
          weight: Number(item.weight),
          earned: item.points_earned == null ? null : Number(item.points_earned),
          possible: Number(item.points_possible),
          status: item.status,
        })));
        const minutes = data.sessions.reduce((sum, session) => {
          if (session.course_id !== course.id) return sum;
          return sum + (studyMinutes(session.started_at, session.ended_at, session.confirmed) ?? 0);
        }, 0);
        const covered = grade.weightTotal > 0 ? Math.round((grade.weightCovered / grade.weightTotal) * 100) : 0;
        return (
          <article key={course.id} className="card">
            <h2 className="font-serif text-2xl">{course.name}</h2>
            <p>{grade.percent == null ? "No graded work recorded." : `${grade.percent}% based on ${covered}% of the weight you have recorded.`}</p>
            {minutes === 0 ? <p>No completed study session for this course.</p> : <p>{minutes} minutes of completed study.</p>}
          </article>
        );
      })}
      <section className="card">
        <h2 className="font-serif text-2xl">From a class you joined</h2>
        {mirror.length === 0 ? <p>You have not joined a class.</p> : mirror.map((row) => (
          <p key={row.assignment_title}>From {row.section_name} ({row.organization_name}): {row.assignment_title}</p>
        ))}
      </section>
    </div>
  );
}

async function Practice({ orgId, userId, finance }: { orgId: string; userId: string; finance: boolean }) {
  const rows = await withOrg(userId, orgId, async (tx) => {
    const engagements = await tx<{ id: string; name: string; status: string }[]>`select id, name, status from engagements order by name`;
    const logs = await tx<{ id: string }[]>`select id from work_logs where started_at >= date_trunc('week', current_date)`;
    return { engagements, logs: logs.length };
  });
  if (rows.engagements.length === 0) return <p>No engagements yet. Add a client before hours or expenses have a place to land.</p>;
  return (
    <div className="grid gap-3">
      <ul>{rows.engagements.filter((row) => row.status === "active").map((row) => <li key={row.id} className="card">{row.name}</li>)}</ul>
      <p className="card">{rows.logs} work log{rows.logs === 1 ? "" : "s"} this week. {finance ? "Expenses are on the engagement." : ""}</p>
    </div>
  );
}
