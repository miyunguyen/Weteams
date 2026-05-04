"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import {
  ApiError,
  clearStoredToken,
  deleteTenant,
  fetchTenantLogs,
  getStoredToken,
  getTenantById,
  restartTenantService,
  updateTenantConfig,
} from '@/services/api';
import type { Tenant } from '@/types/tenant';

interface TenantDetailViewProps {
  tenantId: string;
}

export function TenantDetailView({ tenantId }: TenantDetailViewProps) {
  const router = useRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>('');

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace('/login');
      return;
    }

    void loadTenant();
  }, [router, tenantId]);

  async function loadTenant() {
    setIsLoading(true);
    setMessage(null);

    try {
      const result = await getTenantById(tenantId);
      setTenant(result);
    } catch (error) {
      const text = error instanceof ApiError ? error.message : 'Unable to load tenant';
      setMessage(text);
    } finally {
      setIsLoading(false);
    }
  }

  const summaryRows = useMemo(
    () =>
      tenant
        ? [
            ['Tenant ID', tenant.id],
            ['Name', tenant.name],
            ['Domain', tenant.domain],
            ['Compose Project', tenant.composeProjectName],
            ['Root URL', tenant.rootUrl],
            ['Rocket URL', tenant.rocketUrl],
            ['Status', tenant.deployStatus],
            ['Created', new Date(tenant.createdAt).toLocaleString()],
            ['Updated', new Date(tenant.updatedAt).toLocaleString()],
            ['Last Provisioned', tenant.lastProvisionedAt ? new Date(tenant.lastProvisionedAt).toLocaleString() : 'N/A'],
            ['Deploy Error', tenant.deployError ?? 'None'],
          ]
        : [],
    [tenant],
  );

  const runAction = async (actionName: string, executor: () => Promise<unknown>) => {
    setActionLoading(actionName);
    setMessage(null);

    try {
      const result = await executor();
      if (result && typeof result === 'object' && 'message' in result) {
        setMessage(String((result as { message: unknown }).message));
      } else {
        setMessage(`${actionName} completed`);
      }
      if (actionName === 'delete') {
        clearStoredToken();
        router.push('/dashboard');
      }
      if (actionName === 'logs' && result && typeof result === 'object' && 'data' in result) {
        const payload = (result as { data: unknown }).data;
        setLogs(typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2));
      }
    } catch (error) {
      const text = error instanceof ApiError ? error.message : 'Action failed';
      setMessage(text);
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-72 rounded-2xl bg-slate-200" />
        <div className="grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="h-96 rounded-[1.75rem] bg-slate-200" />
          <div className="h-96 rounded-[1.75rem] bg-slate-200" />
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-8 shadow-container">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary/70">
          Tenant Detail
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          Tenant not found
        </h2>
        <p className="mt-3 text-sm text-slate-600">{message ?? 'The requested tenant could not be resolved.'}</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-container backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <Link href="/dashboard" className="text-sm font-semibold text-primary hover:underline">
              Back to dashboard
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                {tenant.name}
              </h2>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {tenant.deployStatus}
              </span>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Detailed tenant view with operational actions and integration hooks for config updates, restart, logs, and deletion.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() =>
                runAction('config', () => updateTenantConfig({ tenantId: tenant.id }))
              }
              disabled={actionLoading !== null}
            >
              Update Config
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                runAction('restart', () => restartTenantService({ tenantId: tenant.id }))
              }
              disabled={actionLoading !== null}
            >
              Restart Service
            </Button>
            <Button
              variant="secondary"
              onClick={() => runAction('logs', () => fetchTenantLogs({ tenantId: tenant.id }))}
              disabled={actionLoading !== null}
            >
              View Logs
            </Button>
            <Button
              onClick={() => {
                const confirmed = window.confirm('Delete this tenant?');
                if (!confirmed) {
                  return;
                }
                void runAction('delete', () => deleteTenant({ tenantId: tenant.id }));
              }}
              disabled={actionLoading !== null}
            >
              Delete Tenant
            </Button>
          </div>
        </div>

        {message ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {message}
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_0.95fr]">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-container">
          <h3 className="text-lg font-semibold tracking-tight text-slate-950">
            Tenant information
          </h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {summaryRows.map(([label, value]) => (
              <DetailRow key={label} label={label} value={value} />
            ))}
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-container">
          <h3 className="text-lg font-semibold tracking-tight text-slate-950">
            Latest logs
          </h3>
          <pre className="mt-5 max-h-[28rem] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
            {logs || 'Click View Logs to load placeholder logs for this tenant.'}
          </pre>
        </section>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 break-all text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}
