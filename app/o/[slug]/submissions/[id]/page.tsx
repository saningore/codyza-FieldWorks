import { notFound } from "next/navigation";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function SubmissionPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const org = await requireOrg(slug);
  const rows = await withOrg(org.userId, org.orgId, (tx) => tx<{ id: string; user_id: string; body: string }[]>`
    select id, user_id, body from submissions where id = ${id}
  `);
  const submission = rows[0];
  if (!submission) notFound();
  if (submission.user_id !== org.userId && !org.can("gradebook.read")) notFound();
  return (
    <main className="grid gap-3">
      <h1 className="font-serif text-4xl">Submission</h1>
      <p>{submission.body}</p>
    </main>
  );
}
