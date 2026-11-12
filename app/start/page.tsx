import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { startOrganization } from "@/server/auth-actions";
import { getSession } from "@/server/context";

export default async function StartPage() {
  const session = await getSession();
  if (session?.scope === "full") redirect("/orgs");
  if (session?.scope === "enroll") redirect("/mfa");
  return (
    <main id="main" className="mx-auto grid max-w-lg gap-6 px-4 py-12">
      <div>
        <p className="text-sm font-bold text-field">FieldWorks</p>
        <h1 className="font-serif text-4xl">Open a workspace</h1>
        <p className="mt-2">The kind you choose decides the records, the words, and the tools. It does not change later.</p>
      </div>
      <div className="card">
        <ActionForm action={startOrganization} submitLabel="Create workspace">
          <label className="field">Your name<input name="person" required /></label>
          <label className="field">Email<input name="email" type="email" autoComplete="username" required /></label>
          <label className="field">Password
            <input name="password" type="password" autoComplete="new-password" required minLength={12} />
          </label>
          <p className="text-sm">Use 12 or more characters, with a letter and a number. Do not use a common password or your email name.</p>
          <label className="field">Workspace name<input name="name" required /></label>
          <label className="field">Workspace kind
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
      <p className="text-sm">Already have an account? <Link className="font-bold text-field underline" href="/login">Sign in</Link></p>
    </main>
  );
}
