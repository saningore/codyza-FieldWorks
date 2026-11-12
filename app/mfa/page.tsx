import { ActionForm } from "@/components/action-form";
import { beginMfa, confirmMfa } from "@/server/auth-actions";
import { requireUser } from "@/server/context";

export default async function MfaPage() {
  await requireUser();
  return (
    <main id="main" className="mx-auto grid max-w-lg gap-6 px-4 py-12">
      <h1 className="font-serif text-4xl">Authenticator</h1>
      <p>Owners confirm a code before the workspace opens. Add the secret to any authenticator app, then enter the current code.</p>
      <div className="card">
        <ActionForm action={beginMfa} submitLabel="Create authenticator secret">
          <p>Generate a secret for this account.</p>
        </ActionForm>
      </div>
      <div className="card">
        <ActionForm action={confirmMfa} submitLabel="Confirm code">
          <label className="field">Authentication code<input name="code" inputMode="numeric" required /></label>
        </ActionForm>
      </div>
    </main>
  );
}
