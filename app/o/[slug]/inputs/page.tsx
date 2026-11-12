import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { createProduct } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function InputsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "farmer" || !org.can("stock.read")) notFound();
  const products = await withOrg(org.userId, org.orgId, (tx) => tx<{ name: string; on_hand: string; unit: string }[]>`
    select name, on_hand, unit from products order by name
  `);
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Inputs</h1>
      <p>On-hand quantity falls when a done fertilizer or pesticide activity names the product. It cannot fall below zero.</p>
      {products.length === 0 ? <p>No inputs recorded.</p> : (
        <ul>{products.map((product) => <li key={product.name} className="card">{product.name}: {product.on_hand} {product.unit} on hand</li>)}</ul>
      )}
      {org.can("stock.write") ? (
        <div className="card">
          <ActionForm action={createProduct} submitLabel="Add input">
            <input type="hidden" name="slug" value={slug} />
            <label className="field">Name<input name="name" required /></label>
            <label className="field">Unit<input name="unit" defaultValue="lb" /></label>
            <label className="field">On hand<input name="onHand" type="number" min="0" step="0.01" required /></label>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
