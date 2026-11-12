import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { kindLabel } from "@/lib/format";
import { openAnotherWorkspace } from "@/server/auth-actions";
import { listMyOrgs, requireUser } from "@/server/context";

export default async function OrgsPage() {
  const session = await requireUser();
  if (session.scope !== "full") return null;
  const orgs = await listMyOrgs(session.userId);
  return (
    <main id="main" className="mx-auto grid max-w-lg gap-6 px-4 py-12">
      <h1 className="font-serif text-4xl">Your workspaces</h1>
      <ul className="grid gap-3">
        {orgs.map((org) => (
          <li key={org.id} className="card">
            <Link className="font-serif text-2xl text-field underline" href={`/o/${org.slug}`}>{org.name}</Link>
            <p className="text-sm">{kindLabel[org.kind]} · {org.role}</p>
          </li>
        ))}
      </ul>
      {orgs.length === 0 ? <p>You do not belong to a workspace yet.</p> : null}
      <div className="card">
        <h2 className="font-serif text-2xl">Open another workspace</h2>
        <ActionForm action={openAnotherWorkspace} submitLabel="Create">
          <label className="field">Name<input name="name" required /></label>
          <label className="field">Kind
            <select name="kind" defaultValue="farmer">
              <option value="farmer">Farmer</option>
              <option value="engineer">Engineer</option>
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
              <option value="practice">Other professional</option>
            </select>
          </label>
          <label className="field">Timezone<input name="timezone" defaultValue="America/Chicago" /></label>
        </ActionForm>
      </div>
    </main>
  );
}
