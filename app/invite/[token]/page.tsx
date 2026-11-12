import { ActionForm } from "@/components/action-form";
import { sql } from "@/server/db";
import { sha256 } from "@/lib/tokens";
import { acceptInvite } from "@/server/auth-actions";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rows = await sql<{ email: string; organization_name: string; expired: boolean }[]>`
    select email::text, organization_name, expired from app.peek_invite(${sha256(token)})
  `;
  const invite = rows[0];
  return (
    <main id="main" className="mx-auto grid max-w-lg gap-6 px-4 py-12">
      <h1 className="font-serif text-4xl">Join {invite && !invite.expired ? invite.organization_name : "a workspace"}</h1>
      {!invite || invite.expired ? <p>This invite is invalid or expired.</p> : (
        <div className="card">
          <p className="mb-3">This invite is for {invite.email}.</p>
          <ActionForm action={acceptInvite} submitLabel="Join">
            <input type="hidden" name="token" value={token} />
            <label className="field">Your name<input name="name" /></label>
            <label className="field">Password<input name="password" type="password" required /></label>
          </ActionForm>
        </div>
      )}
    </main>
  );
}
