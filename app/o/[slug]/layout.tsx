import { Shell } from "@/components/shell";
import { requireOrg } from "@/server/context";

export const dynamic = "force-dynamic";

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await requireOrg(slug);
  return <Shell org={org}>{children}</Shell>;
}
