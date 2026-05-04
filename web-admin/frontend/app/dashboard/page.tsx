"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SearchBar } from '@/components/SearchBar';
import { TenantCard } from '@/components/TenantCard';
import { ApiError, createTenant, getStoredToken, getTenants } from '@/services/api';
import { getTenantSocket } from '@/services/tenantRealtime';
import type { CreateTenantPayload, DeployStatus, Tenant } from '@/types/tenant';

type CreateTenantFormState = {
  name: string;
  domain: string;
  composeProjectName: string;
  rootUrl: string;
  release: string;
  regToken: string;
  hostPort: string;
  port: string;
  metricsPort: string;
  bindIp: string;
  adminUsername: string;
  adminPass: string;
  mongodbBindIp: string;
  mongodbPortNumber: string;
  mongodbHostPortNumber: string;
  natsPortNumber: string;
  natsBindIp: string;
};

const initialCreateTenantForm: CreateTenantFormState = {
  name: '',
  domain: '',
  composeProjectName: '',
  rootUrl: '',
  release: '8.0.1',
  regToken: '',
  hostPort: '3000',
  port: '3000',
  metricsPort: '9458',
  bindIp: '0.0.0.0',
  adminUsername: 'admin',
  adminPass: 'admin123',
  mongodbBindIp: '127.0.0.1',
  mongodbPortNumber: '27017',
  mongodbHostPortNumber: '27017',
  natsPortNumber: '4222',
  natsBindIp: '127.0.0.1',
};

export default function DashboardPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isInfrastructureOpen, setIsInfrastructureOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isCreatingTenant, setIsCreatingTenant] = useState(false);
  const [activeProvisionTenantId, setActiveProvisionTenantId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateTenantFormState>(initialCreateTenantForm);
  const currentSearchRef = useRef(searchTerm);
  const lastProvisionToastStatus = useRef<DeployStatus | null>(null);

  const visibleTenants = useMemo(() => tenants, [tenants]);
  const activeProvisionTenant = useMemo(
    () => visibleTenants.find((tenant) => tenant.id === activeProvisionTenantId) ?? null,
    [activeProvisionTenantId, visibleTenants],
  );

  const loadTenants = useCallback(async (search: string, silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }

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
      return result.items;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Unable to load tenants';
      setError(message);
      if (!silent) {
        toast.error('Không thể tải danh sách tenant', { description: message });
      }
      return [] as Tenant[];
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace('/login');
      return;
    }

    void loadTenants(searchTerm);
  }, [router, searchTerm, loadTenants]);

  useEffect(() => {
    currentSearchRef.current = searchTerm;
  }, [searchTerm]);

  useEffect(() => {
    if (!getStoredToken()) {
      return;
    }

    const socket = getTenantSocket();
    socket.connect();

    const handleTenantUpdate = () => {
      void loadTenants(currentSearchRef.current, true);
    };

    socket.on('tenant.updated', handleTenantUpdate);

    return () => {
      socket.off('tenant.updated', handleTenantUpdate);
      socket.disconnect();
    };
  }, [loadTenants]);

  useEffect(() => {
    if (!activeProvisionTenant) {
      return;
    }

    if (
      activeProvisionTenant.deployStatus === 'DEPLOYING' ||
      activeProvisionTenant.deployStatus === 'PENDING'
    ) {
      return;
    }

    if (lastProvisionToastStatus.current === activeProvisionTenant.deployStatus) {
      return;
    }

    if (activeProvisionTenant.deployStatus === 'RUNNING') {
      toast.success(`Tenant ${activeProvisionTenant.name} đã sẵn sàng`, {
        description: 'Provision hoàn tất, có thể mở website tenant.',
      });
    }

    if (activeProvisionTenant.deployStatus === 'FAILED') {
      toast.error(`Provision thất bại: ${activeProvisionTenant.name}`, {
        description:
          activeProvisionTenant.deployError || 'Kiểm tra logs backend để xem nguyên nhân.',
      });
    }

    lastProvisionToastStatus.current = activeProvisionTenant.deployStatus;
  }, [activeProvisionTenant]);

  const handleRefresh = () => {
    toast.info('Đang làm mới dashboard...');
    startTransition(() => {
      void loadTenants(searchTerm);
    });
  };

  const handleAddTenant = () => {
    setCreateForm(initialCreateTenantForm);
    setIsInfrastructureOpen(false);
    setIsAdvancedOpen(false);
    setError(null);
    setIsCreateModalOpen(true);
  };

  const handleSubmitCreateTenant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingTenant(true);
    setIsCreateModalOpen(false);
    setError(null);

    const payload = buildCreateTenantPayload(createForm);
    const createRequest = createTenant(payload);

    toast.promise(createRequest, {
      loading: 'Đang tạo tenant và provision hạ tầng...',
      success: 'Tenant đã được tạo. Trạng thái sẽ cập nhật realtime.',
      error: (err: unknown) => (err instanceof Error ? err.message : 'Không thể tạo tenant'),
    });

    try {
      const created = await createRequest;
      const refreshedTenants = await loadTenants(currentSearchRef.current, true);
      const tenantId = resolveProvisionTenantId(created, refreshedTenants, payload.domain);

      if (tenantId) {
        setActiveProvisionTenantId(tenantId);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không thể tạo tenant';
      setError(message);
      toast.error('Không thể tạo tenant', { description: message });
      setIsCreateModalOpen(true);
    } finally {
      setIsCreatingTenant(false);
    }
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
              Search, inspect, and manage tenants with realtime provisioning feedback and direct access links.
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
            {visibleTenants.length} tenant(s) visible
          </div>
        </div>
      </section>

      {activeProvisionTenant ? (
        <section className="rounded-[1.75rem] border border-primary/15 bg-white/90 p-5 shadow-container backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              {activeProvisionTenant.deployStatus === 'DEPLOYING' ||
              activeProvisionTenant.deployStatus === 'PENDING' ? (
                <span className="mt-1 inline-flex h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              ) : activeProvisionTenant.deployStatus === 'RUNNING' ? (
                <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  ✓
                </span>
              ) : (
                <span className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                  !
                </span>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">
                  Realtime Provision
                </p>
                <h3 className="mt-1 text-xl font-semibold text-slate-950">
                  {activeProvisionTenant.name}
                </h3>
                <p className="mt-1 text-sm text-slate-600">{describeProvisionStatus(activeProvisionTenant)}</p>
              </div>
            </div>

            {activeProvisionTenant.rootUrl && activeProvisionTenant.deployStatus === 'RUNNING' ? (
              <a
                href={toExternalUrl(activeProvisionTenant.rootUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Open Tenant Website
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M14 5h5v5" />
                  <path d="M10 14 19 5" />
                  <path d="M19 13v6H5V5h6" />
                </svg>
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

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
      ) : visibleTenants.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleTenants.map((tenant) => (
            <TenantCard key={tenant.id} tenant={tenant} />
          ))}
        </div>
      ) : (
        <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-container">
          <h3 className="text-lg font-semibold text-slate-900">No tenants found</h3>
          <p className="mt-2 text-sm text-slate-500">Try another search term or refresh the dataset.</p>
        </div>
      )}

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-h-[90vh] max-w-2xl rounded-[1.75rem] border border-white/70 bg-white shadow-2xl sm:p-7 flex flex-col">
            <div className="mb-5 flex items-start justify-between gap-3 px-6 pt-6 sm:pt-0">
              <div>
                <h3 className="font-heading text-2xl font-semibold text-slate-950">Add New Tenant</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Nhập thông tin tối thiểu trước, phần cấu hình nâng cao có thể mở rộng khi cần.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 flex-shrink-0"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={isCreatingTenant}
                aria-label="Close create tenant modal"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </div>

            <form className="flex flex-col flex-1 overflow-hidden" onSubmit={handleSubmitCreateTenant}>
              <div className="space-y-4 overflow-y-auto px-6 py-4 sm:px-0 flex-1">
              {/* Basic Information */}
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <label htmlFor="tenant-name" className="text-sm font-medium text-slate-700">
                    Tenant name
                  </label>
                  <input
                    id="tenant-name"
                    type="text"
                    value={createForm.name}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                    required
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    placeholder="Acme School"
                  />
                </Field>

                <Field>
                  <label htmlFor="tenant-domain" className="text-sm font-medium text-slate-700">
                    Domain
                  </label>
                  <input
                    id="tenant-domain"
                    type="text"
                    value={createForm.domain}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, domain: event.target.value }))}
                    required
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    placeholder="acme.local"
                  />
                </Field>

                <Field>
                  <label htmlFor="tenant-root-url" className="text-sm font-medium text-slate-700">
                    Root URL
                  </label>
                  <input
                    id="tenant-root-url"
                    type="text"
                    value={createForm.rootUrl}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, rootUrl: event.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    placeholder="https://acme.local"
                  />
                </Field>

                <Field>
                  <label htmlFor="tenant-compose" className="text-sm font-medium text-slate-700">
                    Compose project name
                  </label>
                  <input
                    id="tenant-compose"
                    type="text"
                    value={createForm.composeProjectName}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, composeProjectName: event.target.value }))}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    placeholder="acme-school"
                  />
                </Field>
              </div>

              {/* Infrastructure: Ports and IPs */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <button
                  type="button"
                  onClick={() => setIsInfrastructureOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition hover:bg-white"
                >
                  <h3 className="text-sm font-semibold text-slate-800">Infrastructure</h3>
                  {isInfrastructureOpen ? (
                    <ChevronUp className="h-5 w-5 text-slate-600" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-600" />
                  )}
                </button>
                {isInfrastructureOpen ? (
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <Field>
                    <label htmlFor="tenant-host-port" className="text-sm font-medium text-slate-700">
                      Host port
                    </label>
                    <input
                      id="tenant-host-port"
                      type="number"
                      value={createForm.hostPort}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, hostPort: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    />
                  </Field>

                  <Field>
                    <label htmlFor="tenant-port" className="text-sm font-medium text-slate-700">
                      Port
                    </label>
                    <input
                      id="tenant-port"
                      type="number"
                      value={createForm.port}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, port: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    />
                  </Field>

                  <Field>
                    <label htmlFor="tenant-metrics-port" className="text-sm font-medium text-slate-700">
                      Metrics port
                    </label>
                    <input
                      id="tenant-metrics-port"
                      type="number"
                      value={createForm.metricsPort}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, metricsPort: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    />
                  </Field>

                  <Field>
                    <label htmlFor="tenant-bind-ip" className="text-sm font-medium text-slate-700">
                      Bind IP
                    </label>
                    <input
                      id="tenant-bind-ip"
                      type="text"
                      value={createForm.bindIp}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, bindIp: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    />
                  </Field>

                  <Field>
                    <label htmlFor="tenant-mongodb-bind-ip" className="text-sm font-medium text-slate-700">
                      MongoDB bind IP
                    </label>
                    <input
                      id="tenant-mongodb-bind-ip"
                      type="text"
                      value={createForm.mongodbBindIp}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, mongodbBindIp: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    />
                  </Field>

                  <Field>
                    <label htmlFor="tenant-mongodb-port" className="text-sm font-medium text-slate-700">
                      MongoDB port
                    </label>
                    <input
                      id="tenant-mongodb-port"
                      type="number"
                      value={createForm.mongodbPortNumber}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, mongodbPortNumber: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    />
                  </Field>

                  <Field>
                    <label htmlFor="tenant-mongodb-host-port" className="text-sm font-medium text-slate-700">
                      MongoDB host port
                    </label>
                    <input
                      id="tenant-mongodb-host-port"
                      type="number"
                      value={createForm.mongodbHostPortNumber}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, mongodbHostPortNumber: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    />
                  </Field>

                  <Field>
                    <label htmlFor="tenant-nats-port" className="text-sm font-medium text-slate-700">
                      NATS port
                    </label>
                    <input
                      id="tenant-nats-port"
                      type="number"
                      value={createForm.natsPortNumber}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, natsPortNumber: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    />
                  </Field>

                  <Field>
                    <label htmlFor="tenant-nats-bind-ip" className="text-sm font-medium text-slate-700">
                      NATS bind IP
                    </label>
                    <input
                      id="tenant-nats-bind-ip"
                      type="text"
                      value={createForm.natsBindIp}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, natsBindIp: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    />
                  </Field>
                </div>
                ) : null}
              </div>

              {/* Advanced Settings */}
              <button
                type="button"
                onClick={() => setIsAdvancedOpen((prev) => !prev)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Advanced settings</p>
                    <p className="text-xs text-slate-500">
                      Mở để cấu hình release, credentials và registration token.
                    </p>
                  </div>
                  {isAdvancedOpen ? (
                    <ChevronUp className="h-5 w-5 text-slate-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-600 flex-shrink-0 mt-0.5" />
                  )}
                </div>
              </button>

              {isAdvancedOpen ? (
                <fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <legend className="text-sm font-semibold text-slate-800">Advanced settings</legend>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <Field>
                    <label htmlFor="tenant-release" className="text-sm font-medium text-slate-700">
                      Release
                    </label>
                    <input
                      id="tenant-release"
                      type="text"
                      value={createForm.release}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, release: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                      placeholder="8.0.1"
                    />
                  </Field>

                  <Field>
                    <label htmlFor="tenant-reg-token" className="text-sm font-medium text-slate-700">
                      Registration token
                    </label>
                    <input
                      id="tenant-reg-token"
                      type="text"
                      value={createForm.regToken}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, regToken: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    />
                  </Field>

                  <Field>
                    <label htmlFor="tenant-admin-user" className="text-sm font-medium text-slate-700">
                      Admin username
                    </label>
                    <input
                      id="tenant-admin-user"
                      type="text"
                      value={createForm.adminUsername}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, adminUsername: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    />
                  </Field>

                  <Field>
                    <label htmlFor="tenant-admin-pass" className="text-sm font-medium text-slate-700">
                      Admin password
                    </label>
                    <input
                      id="tenant-admin-pass"
                      type="text"
                      value={createForm.adminPass}
                      onChange={(event) => setCreateForm((prev) => ({ ...prev, adminPass: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                    />
                  </Field>
                </div>
                </fieldset>
              ) : null}
              </div>

              <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3 sm:px-0">
                <Button type="button" variant="secondary" onClick={() => setIsCreateModalOpen(false)} disabled={isCreatingTenant}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreatingTenant}>
                  {isCreatingTenant ? 'Provisioning...' : 'Create Tenant'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

function buildCreateTenantPayload(form: CreateTenantFormState): CreateTenantPayload {
  return {
    name: form.name.trim(),
    domain: form.domain.trim(),
    composeProjectName: trimToUndefined(form.composeProjectName),
    rootUrl: trimToUndefined(form.rootUrl),
    release: trimToUndefined(form.release),
    regToken: trimToUndefined(form.regToken),
    hostPort: toOptionalNumber(form.hostPort),
    port: toOptionalNumber(form.port),
    metricsPort: toOptionalNumber(form.metricsPort),
    bindIp: trimToUndefined(form.bindIp),
    adminUsername: trimToUndefined(form.adminUsername),
    adminPass: trimToUndefined(form.adminPass),
    mongodbBindIp: trimToUndefined(form.mongodbBindIp),
    mongodbPortNumber: toOptionalNumber(form.mongodbPortNumber),
    mongodbHostPortNumber: toOptionalNumber(form.mongodbHostPortNumber),
    natsPortNumber: toOptionalNumber(form.natsPortNumber),
    natsBindIp: trimToUndefined(form.natsBindIp),
  };
}

function resolveProvisionTenantId(
  created: { data: { tenant?: Tenant; tenantId?: string } },
  tenants: Tenant[],
  fallbackDomain: string,
) {
  if (created.data?.tenant?.id) {
    return created.data.tenant.id;
  }

  if (created.data?.tenantId) {
    return created.data.tenantId;
  }

  const byDomain = tenants.find((tenant) => tenant.domain === fallbackDomain);
  return byDomain?.id;
}

function describeProvisionStatus(tenant: Tenant) {
  if (tenant.deployStatus === 'RUNNING') {
    return 'Tenant đã sẵn sàng và có thể truy cập ngay.';
  }

  if (tenant.deployStatus === 'FAILED') {
    return tenant.deployError || 'Provision thất bại.';
  }

  return 'Tenant đang được provision. Trạng thái sẽ cập nhật realtime.';
}

function trimToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toExternalUrl(value: string): string {
  return value.startsWith('http://') || value.startsWith('https://') ? value : `http://${value}`;
}
