"use client";

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { SearchBar } from '@/components/SearchBar';
import { TenantCard } from '@/components/TenantCard';
import { ApiError, clearStoredToken, getStoredToken, getTenants } from '@/services/api';
import type { Tenant } from '@/types/tenant';

export default function DashboardPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace('/login');
      return;
    }

    void loadTenants(searchTerm);
  }, [router, searchTerm]);

  const filteredTenants = useMemo(() => tenants, [tenants]);

  async function loadTenants(search: string) {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getTenants({
        search: search.trim() || undefined,
        page: 1,
        pageSize: 50,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
      setTenants(result.items);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to load tenants';
      setError(message);
      setTenants([]);
    } finally {
      setIsLoading(false);
    }
  }

  const handleRefresh = () => {
    startTransition(() => {
      void loadTenants(searchTerm);
    });
  };

  const handleAddTenant = () => {
    window.alert(
      'Placeholder: connect this button to the tenant provisioning flow when the create form is ready.',
    );
  };

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-container backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary/70">
              Dashboard
            </p>
            <h2 className="font-heading text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Tenant containers, actions, and health in one view
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Search, inspect, and manage tenants through a container-style list built for fast operations.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleAddTenant}>Add Tenant</Button>
            <Button variant="secondary" onClick={handleRefresh} disabled={isPending}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
            {filteredTenants.length} tenant(s) visible
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-56 animate-pulse rounded-[1.75rem] bg-white shadow-container" />
          ))}
        </div>
      ) : filteredTenants.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredTenants.map((tenant) => (
            <TenantCard key={tenant.id} tenant={tenant} />
          ))}
        </div>
      ) : (
        <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-container">
          <h3 className="text-lg font-semibold text-slate-900">No tenants found</h3>
          <p className="mt-2 text-sm text-slate-500">
            Try another search term or refresh the dataset.
          </p>
        </div>
      )}
    </div>
  );
}
