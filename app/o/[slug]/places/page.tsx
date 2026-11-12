import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { MapView } from "@/components/map-view";
import { createPlace } from "@/server/work-actions";
import { requireOrg } from "@/server/context";
import { withOrg } from "@/server/db";

export default async function PlacesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  if (org.kind !== "student") notFound();
  const places = await withOrg(org.userId, org.orgId, (tx) => tx<{ id: string; name: string; lng: number; lat: number }[]>`
    select id, name, lng, lat from study_places order by name
  `);
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl">Places</h1>
      <MapView
        empty="No places yet. Add a library, lab, or classroom before a pin appears."
        points={places.map((place) => ({ id: place.id, title: place.name, subtitle: "Saved place", lat: Number(place.lat), lng: Number(place.lng), href: `/o/${slug}/places` }))}
      />
      <div className="card">
        <ActionForm action={createPlace} submitLabel="Add place">
          <input type="hidden" name="slug" value={slug} />
          <label className="field">Name<input name="name" required /></label>
          <label className="field">Longitude<input name="lng" type="number" step="0.0001" required /></label>
          <label className="field">Latitude<input name="lat" type="number" step="0.0001" required /></label>
        </ActionForm>
      </div>
    </div>
  );
}
