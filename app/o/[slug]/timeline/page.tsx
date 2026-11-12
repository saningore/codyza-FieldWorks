import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { criticalPath, dependencyViolations } from "@/lib/domain";
import { addDependency } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function TimelinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "engineer") notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const issues = await tx<{ id: string; number: number; title: string; start_on: string | null; end_on: string | null }[]>`
      select id, number, title, start_on::text, end_on::text from issues order by number
    `;
    const edges = await tx<{ predecessor_id: string; successor_id: string }[]>`
      select predecessor_id, successor_id from issue_dependencies
    `;
    return { issues, edges };
  });
  const dated = data.issues.filter((issue) => issue.start_on && issue.end_on);
  const nodes = dated.map((issue) => ({
    id: issue.id,
    days: Math.max(1, Math.round((Date.parse(issue.end_on as string) - Date.parse(issue.start_on as string)) / 86_400_000)),
  }));
  const edges = data.edges.map((edge) => ({ from: edge.predecessor_id, to: edge.successor_id }));
  const path = criticalPath(nodes, edges);
  const violations = dependencyViolations(dated.map((issue) => ({ id: issue.id, start: issue.start_on, end: issue.end_on })), edges);
  const min = dated.reduce((value, issue) => Math.min(value, Date.parse(issue.start_on as string)), Number.POSITIVE_INFINITY);
  const max = dated.reduce((value, issue) => Math.max(value, Date.parse(issue.end_on as string)), 0);
  const span = Math.max(1, max - min);
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Timeline</h1>
      {dated.length === 0 ? <p>No dated issues on this workspace.</p> : (
        <svg role="img" aria-label="Issue timeline" viewBox={`0 0 640 ${dated.length * 36 + 20}`} className="w-full rounded-2xl border border-line bg-card">
          {dated.map((issue, index) => {
            const x = ((Date.parse(issue.start_on as string) - min) / span) * 500 + 120;
            const width = Math.max(8, ((Date.parse(issue.end_on as string) - Date.parse(issue.start_on as string)) / span) * 500);
            return (
              <g key={issue.id}>
                <text x="8" y={index * 36 + 22} fontSize="12">ENG-{issue.number}</text>
                <rect x={x} y={index * 36 + 10} width={width} height="16" fill="#2f6f4e" />
              </g>
            );
          })}
        </svg>
      )}
      <p>{path.days == null ? "The dependency graph has a cycle, so there is no critical path." : `Longest finish-to-start path: ${path.days} days.`}</p>
      {violations.length === 0 ? <p>No finish-to-start date is violated.</p> : <p>{violations.length} dependency has a successor that starts before its predecessor ends.</p>}
      {org.can("issue.write") && data.issues.length > 1 ? (
        <div className="card">
          <h2 className="font-serif text-2xl">Finish-to-start dependency</h2>
          <ActionForm action={addDependency} submitLabel="Add dependency">
            <input type="hidden" name="slug" value={slug} />
            <label className="field">Predecessor
              <select name="predecessor">{data.issues.map((issue) => <option key={issue.id} value={issue.id}>ENG-{issue.number} {issue.title}</option>)}</select>
            </label>
            <label className="field">Successor
              <select name="successor">{data.issues.map((issue) => <option key={issue.id} value={issue.id}>ENG-{issue.number} {issue.title}</option>)}</select>
            </label>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
