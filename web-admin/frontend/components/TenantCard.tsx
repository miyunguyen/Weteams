import Link from 'next/link';
import type { Tenant } from '@/types/tenant';

const statusStyles: Record<Tenant['deployStatus'], string> = {
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  DEPLOYING: 'bg-sky-50 text-sky-700 ring-sky-200',
  RUNNING: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 ring-rose-200',
};

interface TenantCardProps {
  tenant: Tenant;
}

export function TenantCard({ tenant }: TenantCardProps) {
  return (
    <Link
      href={`/dashboard/tenant/${tenant.id}`}
      className="group block rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-container transition duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-xl"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold tracking-tight text-slate-950">
              {tenant.name}
            </h3>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusStyles[tenant.deployStatus]}`}>
              {tenant.deployStatus}
            </span>
          </div>
          <p className="text-sm text-slate-500">{tenant.domain}</p>
        </div>
        <div className="rounded-2xl bg-primary/5 p-3 text-primary transition group-hover:bg-primary/10">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <InfoRow label="Compose" value={tenant.composeProjectName} />
        <InfoRow label="Rocket URL" value={tenant.rocketUrl} />
        <InfoRow label="Root URL" value={tenant.rootUrl} />
        <InfoRow label="Updated" value={new Date(tenant.updatedAt).toLocaleString()} />
      </div>

      {tenant.deployError ? (
        <p className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {tenant.deployError}
        </p>
      ) : null}
    </Link>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 break-all text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}
