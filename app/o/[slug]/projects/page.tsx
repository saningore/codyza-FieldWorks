import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { MapView } from "@/components/map-view";
import { milestoneProgress } from "@/lib/domain";
import { createProject } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function ProjectsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "engineer") notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const projects = await tx<{ id: string; name: string; summary: string; site_name: string | null; site_lat: number | null; site_lng: number | null }[]>`
      select id, name, summary, site_name, site_lat, site_lng from projects order by name
    `;
    const issues = await tx<{ project_id: string; status: string }[]>`select project_id, status from issues`;
    return { projects, issues };
  });
  const sites = data.projects.filter((project) => project.site_lat != null && project.site_lng != null);
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Projects</h1>
      {data.projects.length === 0 ? <p>No projects yet.</p> : data.projects.map((project) => {
        const progress = milestoneProgress(data.issues.filter((issue) => issue.project_id === project.id).map((issue) => issue.status));
        return (
          <article key={project.id} className="card">
            <Link className="font-serif text-2xl text-field underline" href={`/o/${slug}/projects/${project.id}`}>{project.name}</Link>
            <p>{project.summary}</p>
            <p>Issues: {progress.label}</p>
          </article>
        );
      })}
      <MapView
        empty="No sites recorded."
        points={sites.map((project) => ({
          id: project.id,
          title: project.site_name || project.name,
          subtitle: project.name,
          lat: Number(project.site_lat),
          lng: Number(project.site_lng),
          href: `/o/${slug}/projects/${project.id}`,
        }))}
      />
      {org.can("project.write") ? (
        <div className="card">
          <h2 className="font-serif text-2xl">New project</h2>
          <ActionForm action={createProject} submitLabel="Create project">
            <input type="hidden" name="slug" value={slug} />
            <label className="field">Name<input name="name" required /></label>
            <label className="field">Summary<textarea name="summary" /></label>
            <label className="field">Start<input name="start" type="date" /></label>
            <label className="field">Target<input name="target" type="date" /></label>
            <label className="field">Site name<input name="siteName" /></label>
            <label className="field">Site address<input name="siteAddress" /></label>
            <label className="field">Longitude<input name="lng" type="number" step="0.0001" /></label>
            <label className="field">Latitude<input name="lat" type="number" step="0.0001" /></label>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
