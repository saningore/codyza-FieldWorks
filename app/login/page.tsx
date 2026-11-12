import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSession } from "@/server/context";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.scope === "full") redirect("/orgs");
  if (session?.scope === "enroll") redirect("/mfa");
  return (
    <main id="main" className="mx-auto grid max-w-lg gap-6 px-4 py-12">
      <div>
        <p className="text-sm font-bold text-field">FieldWorks</p>
        <h1 className="font-serif text-4xl">Sign in</h1>
        <p className="mt-2">Use the workspace you belong to. A person in two workspaces works in one at a time.</p>
      </div>
      <div className="card"><LoginForm /></div>
      <p className="text-sm">New here? <Link className="font-bold text-field underline" href="/start">Open a workspace</Link></p>
      <p className="text-sm"><Link className="font-bold text-field underline" href="/forgot">Forgot password</Link></p>
    </main>
  );
}
