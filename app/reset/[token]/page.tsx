import { ActionForm } from "@/components/action-form";
import { resetPassword } from "@/server/auth-actions";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main id="main" className="mx-auto grid max-w-lg gap-6 px-4 py-12">
      <h1 className="font-serif text-4xl">Choose a new password</h1>
      <div className="card">
        <ActionForm action={resetPassword} submitLabel="Update password">
          <input type="hidden" name="token" value={token} />
          <label className="field">New password<input name="password" type="password" required minLength={12} /></label>
        </ActionForm>
      </div>
    </main>
  );
}
