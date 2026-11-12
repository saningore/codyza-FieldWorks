import { ActionForm } from "@/components/action-form";
import { forgotPassword } from "@/server/auth-actions";

export default function ForgotPage() {
  return (
    <main id="main" className="mx-auto grid max-w-lg gap-6 px-4 py-12">
      <h1 className="font-serif text-4xl">Reset your password</h1>
      <div className="card">
        <ActionForm action={forgotPassword} submitLabel="Send reset link">
          <label className="field">Email<input name="email" type="email" required /></label>
        </ActionForm>
      </div>
    </main>
  );
}
