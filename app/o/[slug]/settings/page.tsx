import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { rolesForKind, titleCase } from "@/lib/format";
import { sendInvite } from "@/server/auth-actions";
import { requireOrg } from "@/server/context";

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (!org.can("member.invite") && !org.can("org.manage")) notFound();
  const roles = rolesForKind[org.kind] ?? [];
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Settings</h1>
      <p>Timezone {org.timezone}. Kind {org.kind}. This kind does not change.</p>
      {roles.length > 0 ? (
        <div className="card">
          <h2 className="font-serif text-2xl">Invite</h2>
          <ActionForm action={sendInvite} submitLabel="Create invite link">
            <input type="hidden" name="slug" value={slug} />
            <label className="field">Email<input name="email" type="email" required /></label>
            <label className="field">Role
              <select name="role">{roles.map((role) => <option key={role} value={role}>{titleCase(role)}</option>)}</select>
            </label>
          </ActionForm>
        </div>
      ) : <p>This workspace does not invite extra roles.</p>}
    </div>
  );
}
