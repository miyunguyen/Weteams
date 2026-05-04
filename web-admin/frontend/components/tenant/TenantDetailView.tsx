"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, ExternalLink, Layers3, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  ApiError,
  deleteTenant,
  getStoredToken,
  getTenantById,
  restartTenantService,
  updateTenantConfig,
} from '@/services/api';
import { getTenantSocket, type TenantRealtimeEvent } from '@/services/tenantRealtime';
import type { TenantDetail, TenantDetailTeam, TenantDetailUser } from '@/types/tenant';

interface TenantDetailViewProps {
  tenantId: string;
}

export function TenantDetailView({ tenantId }: TenantDetailViewProps) {
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showInfrastructure, setShowInfrastructure] = useState(false);
  const [showProvision, setShowProvision] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  const loadTenant = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const result = await getTenantById(tenantId);
      setTenant(result);
    } catch (error) {
      const text = error instanceof ApiError ? error.message : 'Unable to load tenant';
      setMessage(text);
      setTenant(null);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace('/login');
      return;
    }

    void loadTenant();
  }, [router, loadTenant]);

  useEffect(() => {
    if (!getStoredToken()) {
      return;
    }

    const socket = getTenantSocket();
    socket.connect();

    const handleTenantUpdate = (event: TenantRealtimeEvent) => {
      if (event.tenantId === tenantId) {
        void loadTenant();
      }
    };

    socket.on('tenant.updated', handleTenantUpdate);

    return () => {
      socket.off('tenant.updated', handleTenantUpdate);
      socket.disconnect();
    };
  }, [loadTenant, tenantId]);

  const overviewCards = useMemo(
    () =>
      tenant
        ? [
            { label: 'Tenant ID', value: tenant.id },
            { label: 'Compose project', value: tenant.composeProjectName || 'N/A' },
            { label: 'Domain', value: tenant.domain },
            { label: 'Status', value: tenant.deployStatus },
            { label: 'Teams', value: String(tenant._count.teams) },
            { label: 'Users', value: String(tenant._count.users) },
            { label: 'Team members', value: String(tenant.teamMemberTotal) },
            { label: 'Last provisioned', value: formatDate(tenant.lastProvisionedAt) },
          ]
        : [],
    [tenant],
  );

  const infrastructureRows = useMemo(
    () =>
      tenant
        ? [
            ['Host Port', tenant.hostPort?.toString() || 'N/A'],
            ['Port', tenant.port?.toString() || 'N/A'],
            ['Metrics Port', tenant.metricsPort?.toString() || 'N/A'],
            ['Bind IP', tenant.bindIp || 'N/A'],
            ['MongoDB Bind IP', tenant.mongodbBindIp || 'N/A'],
            ['MongoDB Port', tenant.mongodbPortNumber?.toString() || 'N/A'],
            ['MongoDB Host Port', tenant.mongodbHostPortNumber?.toString() || 'N/A'],
            ['NATS Port', tenant.natsPortNumber?.toString() || 'N/A'],
            ['NATS Bind IP', tenant.natsBindIp || 'N/A'],
          ]
        : [],
    [tenant],
  );

  const provisionRows = useMemo(
    () =>
      tenant
        ? [
            ['Release', tenant.release || 'N/A'],
            ['Registration token', tenant.regToken || 'N/A'],
            ['Admin username', tenant.adminUsername || 'N/A'],
            ['Admin password', tenant.adminPass || 'N/A'],
            ['Rocket URL', tenant.rocketUrl || 'N/A'],
            ['Root URL', tenant.rootUrl || 'N/A'],
            ['Deploy error', tenant.deployError ?? 'None'],
            ['Created', formatDate(tenant.createdAt)],
            ['Updated', formatDate(tenant.updatedAt)],
          ]
        : [],
    [tenant],
  );

  const runAction = useCallback(async (actionName: string, executor: () => Promise<unknown>) => {
    setActionLoading(actionName);
    setMessage(null);

    const actionPromise = executor();

    toast.promise(actionPromise, {
      loading: `${actionName}...`,
      success: `${actionName} completed`,
      error: (err: unknown) => (err instanceof Error ? err.message : 'Action failed'),
    });

    try {
      const result = await actionPromise;

      if (result && typeof result === 'object' && 'message' in result) {
        setMessage(String((result as { message: unknown }).message));
      } else {
        setMessage(`${actionName} completed`);
      }
    } catch (error) {
      const text = error instanceof ApiError ? error.message : 'Action failed';
      setMessage(text);
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleDelete = async () => {
    setIsDeleteLoading(true);

    try {
      await deleteTenant({ tenantId });
      toast.success('Tenant đã được xoá');
      router.push('/dashboard');
    } catch (error) {
      const text = error instanceof ApiError ? error.message : 'Delete failed';
      toast.error('Không thể xoá tenant', { description: text });
      setMessage(text);
    } finally {
      setIsDeleteLoading(false);
      setIsDeleteDialogOpen(false);
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
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary/70">Tenant Detail</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Tenant not found</h2>
        <p className="mt-3 text-sm text-slate-600">{message ?? 'The requested tenant could not be resolved.'}</p>
        <Link href="/dashboard" className="mt-6 inline-flex rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-container backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Link href="/dashboard" className="text-sm font-semibold text-primary hover:underline">
              Back to dashboard
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                {tenant.name}
              </h2>
              <StatusPill value={tenant.deployStatus} />
            </div>
            <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Chi tiết tenant, hạ tầng, provision, teams và users được đồng bộ realtime từ backend.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {tenant.rootUrl ? (
              <a
                href={toExternalUrl(tenant.rootUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Open
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
            <Button onClick={() => setIsDeleteDialogOpen(true)} disabled={actionLoading !== null}>
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

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-container">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          <Layers3 className="h-4 w-4" />
          Overview
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {overviewCards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {card.label}
              </div>
              <div className="mt-1 break-words text-sm font-medium text-slate-800">
                {card.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-container">
          <CollapsibleSection
            title="Infrastructure"
            description="Port, IP và các binding service nội bộ"
            open={showInfrastructure}
            onToggle={() => setShowInfrastructure((value) => !value)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {infrastructureRows.map(([label, value]) => (
                <DetailRow key={label} label={label} value={value} />
              ))}
            </div>
          </CollapsibleSection>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-container">
          <CollapsibleSection
            title="Provision & Access"
            description="Thông tin triển khai, credential và trạng thái"
            open={showProvision}
            onToggle={() => setShowProvision((value) => !value)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {provisionRows.map(([label, value]) => (
                <DetailRow key={label} label={label} value={value} />
              ))}
            </div>
          </CollapsibleSection>
        </section>
      </div>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-container">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          <ShieldCheck className="h-4 w-4" />
          Teams
        </div>
        <div className="mt-5 space-y-4">
          {tenant.teams.length > 0 ? (
            tenant.teams.map((team) => <TeamCard key={team.id} team={team} />)
          ) : (
            <EmptyState title="No teams" description="Tenant này chưa có team nào." />
          )}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-container">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          <Users className="h-4 w-4" />
          Users
        </div>
        <div className="mt-5 space-y-4">
          {tenant.users.length > 0 ? (
            tenant.users.map((user) => <UserCard key={user.id} user={user} />)
          ) : (
            <EmptyState title="No users" description="Tenant này chưa có user nào." />
          )}
        </div>
      </section>

      <ConfirmDialog
        open={isDeleteDialogOpen}
        title="Delete tenant"
        description={`Delete ${tenant.name}? This action will remove tenant access and mark it for cleanup.`}
        confirmText={isDeleteLoading ? 'Deleting...' : 'Delete tenant'}
        cancelText="Cancel"
        loading={isDeleteLoading}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteDialogOpen(false)}
      />
    </div>
  );
}

function CollapsibleSection({
  title,
  description,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100"
      >
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 flex-shrink-0 text-slate-600" />
        ) : (
          <ChevronDown className="h-5 w-5 flex-shrink-0 text-slate-600" />
        )}
      </button>
      {open ? <div>{children}</div> : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 break-all text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}

function TeamCard({ team }: { team: TenantDetailTeam }) {
  return (
    <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h4 className="text-base font-semibold tracking-tight text-slate-950">
            {team.name || 'Unnamed team'}
          </h4>
          <p className="mt-1 text-sm text-slate-500">Room: {team.roomId}</p>
        </div>
        <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {team.members.length} members
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <DetailRow label="Team ID" value={team.teamId} />
        <DetailRow label="Join code" value={team.joinCode} />
        <DetailRow label="Created" value={formatDate(team.createdAt)} />
        <DetailRow label="Room ID" value={team.roomId} />
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Members</p>
        <div className="mt-3 space-y-3">
          {team.members.length > 0 ? (
            team.members.map((member) => (
              <div key={member.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">
                      {member.user.name || member.user.username}
                    </p>
                    <p className="text-sm text-slate-500">{member.user.username}</p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Joined {formatDate(member.joinedAt)}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailRow label="Email" value={member.user.email || 'N/A'} />
                  <DetailRow label="Role" value={member.user.role || 'N/A'} />
                  <DetailRow label="Rocket user" value={member.user.rocketUserId} />
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="No members" description="Team này chưa có thành viên." />
          )}
        </div>
      </div>
    </article>
  );
}

function UserCard({ user }: { user: TenantDetailUser }) {
  const teamNames = user.teamMembers
    .map((member) => member.team.name || member.team.roomId)
    .filter((value): value is string => Boolean(value));

  return (
    <article className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h4 className="text-base font-semibold tracking-tight text-slate-950">
            {user.name || user.username}
          </h4>
          <p className="mt-1 text-sm text-slate-500">{user.username}</p>
        </div>
        <span className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
          {user.role || 'N/A'}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DetailRow label="Email" value={user.email || 'N/A'} />
        <DetailRow label="Phone" value={user.phoneNumber || 'N/A'} />
        <DetailRow label="Citizen ID" value={user.citizenId || 'N/A'} />
        <DetailRow label="Address" value={user.address || 'N/A'} />
        <DetailRow label="Date of birth" value={formatDate(user.dateOfBirth)} />
        <DetailRow label="Rocket user" value={user.rocketUserId} />
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Teams</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {teamNames.length > 0 ? (
            teamNames.map((name) => (
              <span key={name} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {name}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-500">No team memberships</span>
          )}
        </div>
      </div>
    </article>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const className =
    value === 'RUNNING'
      ? 'bg-emerald-100 text-emerald-700'
      : value === 'FAILED'
        ? 'bg-rose-100 text-rose-700'
        : value === 'DEPLOYING'
          ? 'bg-sky-100 text-sky-700'
          : 'bg-amber-100 text-amber-700';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${className}`}>
      {value}
    </span>
  );
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'N/A';
}

function toExternalUrl(value: string): string {
  return value.startsWith('http://') || value.startsWith('https://') ? value : `http://${value}`;
}
