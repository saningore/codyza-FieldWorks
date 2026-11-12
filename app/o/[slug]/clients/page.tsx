import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { MapView } from "@/components/map-view";
import { createClient } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function ClientsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "practice") notFound();
  const data = await withOrg(org.userId, org.orgId, async (tx) => {
    const clients = await tx<{ id: string; name: string }[]>`select id, name from clients order by name`;
    const sites = await tx<{ id: string; name: string; address: string; lng: number | null; lat: number | null; client_id: string }[]>`
      select id, name, address, lng, lat, client_id from sites
    `;
    return { clients, sites };
  });
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Clients</h1>
      {data.clients.length === 0 ? <p>No clients yet.</p> : data.clients.map((client) => <article key={client.id} className="card">{client.name}</article>)}
      <MapView
        empty="No sites recorded."
        points={data.sites.filter((site) => site.lat != null && site.lng != null).map((site) => ({
          id: site.id,
          title: site.name,
          subtitle: site.address,
          lat: Number(site.lat),
          lng: Number(site.lng),
          href: `/o/${slug}/clients`,
        }))}
      />
      {org.can("client.write") ? (
        <div className="card">
          <ActionForm action={createClient} submitLabel="Add client">
            <input type="hidden" name="slug" value={slug} />
            <label className="field">Name<input name="name" required /></label>
            <label className="field">Notes<textarea name="notes" /></label>
            <label className="field">Site name<input name="site" /></label>
            <label className="field">Address<input name="address" /></label>
            <label className="field">Longitude<input name="lng" type="number" step="0.0001" /></label>
            <label className="field">Latitude<input name="lat" type="number" step="0.0001" /></label>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
