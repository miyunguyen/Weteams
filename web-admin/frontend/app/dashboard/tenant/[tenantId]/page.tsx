import { TenantDetailView } from '@/components/tenant/TenantDetailView';

export default function TenantDetailPage({
  params,
}: {
  params: { tenantId: string };
}) {
  return <TenantDetailView tenantId={params.tenantId} />;
}
