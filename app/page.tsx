import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/context";

export default async function HomePage() {
  const session = await getSession();
  if (session?.scope === "full") redirect("/orgs");
  if (session?.scope === "enroll") redirect("/mfa");
  return (
    <main id="main" className="mx-auto grid max-w-5xl gap-10 px-4 py-12">
      <header className="grid gap-4">
        <Link className="text-sm font-bold text-field" href="/">FieldWorks</Link>
        <h1 className="max-w-3xl font-serif text-5xl tracking-tight">The workspace changes with the work.</h1>
        <p className="max-w-2xl text-lg text-ink/80">
          Farms get fields, seasons, and input stock. Engineering teams get issues, milestones, and decision history.
          Teachers get a gradebook and attendance. Students get a term, a timetable, and their own grades. A practice gets clients, sites, and time.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link className="btn" href="/login">Sign in</Link>
          <Link className="btn-secondary" href="/start">Open a workspace</Link>
        </div>
      </header>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="card">
          <h2 className="font-serif text-2xl">Farm</h2>
          <p className="mt-2">Draw field boundaries, plan the season, record sprays and harvests, and see cost and yield from those rows.</p>
        </article>
        <article className="card">
          <h2 className="font-serif text-2xl">Engineering</h2>
          <p className="mt-2">Track issues through fixed stages, watch milestone progress, and keep every decision revision.</p>
        </article>
        <article className="card">
          <h2 className="font-serif text-2xl">Teaching</h2>
          <p className="mt-2">Publish assignments, store the server time of each attempt, post grades, and take attendance for a real meeting.</p>
        </article>
        <article className="card">
          <h2 className="font-serif text-2xl">Study and practice</h2>
          <p className="mt-2">A student records returned marks and study sessions. A practice records clients, sites, and hours.</p>
        </article>
      </section>
    </main>
  );
}
