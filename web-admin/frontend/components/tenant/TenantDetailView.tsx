"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, CircleCheckBig, ExternalLink, Layers3, Loader2, Rocket, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  ApiError,
  deployTenantApp,
  deleteTenant,
  getStoredToken,
  getTenantById,
  restartTenantService,
  updateTenantConfig,
  getTenantUsers,
  getTenantTeams,
  getTeamMembers,
  syncTenantUsersFromRocket,
  syncTeamMembershipsFromRocket,
  createTeamWithChannels,
  importUsers,
  createUser,
  updateUser,
  deleteUser,
  getCurrentUser,
  createTenantAdmin,
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
  const [deployStatus, setDeployStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [deployMessage, setDeployMessage] = useState<string | null>(null);

  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  const [teamForm, setTeamForm] = useState<{ roomName: string }>({ roomName: '' });
  const DEFAULT_CHANNELS = [
    'Ngữ văn',
    'Toán',
    'Anh',
    'Lịch sử',
    'Thể dục',
    'GDQP',
    'Địa lí',
    'Vật lí',
    'Hóa học',
    'Sinh học',
    'Công nghệ',
    'Tin học',
    'Thông báo',
    'Phụ huynh',
  ];
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(
    new Set(DEFAULT_CHANNELS),
  );
  const [customChannels, setCustomChannels] = useState<string[]>([]);
  const [newChannel, setNewChannel] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [userForm, setUserForm] = useState<Record<string, any>>({ name: '', username: '', email: '', role: undefined, phoneNumber: '', citizenId: '', address: '', dateOfBirth: '', avatarUrl: '' });
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [createTenantAdminOpen, setCreateTenantAdminOpen] = useState(false);
  const [tenantAdminForm, setTenantAdminForm] = useState<{ email: string; username: string; password: string; role?: string }>({ email: '', username: '', password: '', role: 'ADMIN' });

  // Handle 401 Unauthorized (token expired)
  const handleAuthError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      toast.error('Phiên đăng nhập đã hết hạn', { description: 'Vui lòng đăng nhập lại' });
      router.push('/login');
      return true;
    }
    return false;
  }, [router]);

  const loadTenant = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const result = await getTenantById(tenantId);
      setTenant(result);
    } catch (error) {
      if (handleAuthError(error)) return;
      const text = error instanceof ApiError ? error.message : 'Unable to load tenant';
      setMessage(text);
      setTenant(null);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, handleAuthError]);

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace('/login');
      return;
    }

    void (async () => {
      try {
        const me = await getCurrentUser();
        setCurrentUser(me);
      } catch (err) {
        // ignore
      }
      void loadTenant();
    })();
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
      if (!handleAuthError(error)) {
        const text = error instanceof ApiError ? error.message : 'Action failed';
        setMessage(text);
      }
    } finally {
      setActionLoading(null);
    }
  }, [handleAuthError]);

  const handleDeployAppEngine = useCallback(async () => {
    if (!tenant) return;

    setDeployStatus('loading');
    setDeployMessage('Đang khởi chạy deploy Rocket.Chat App Engine...');

    try {
      const result = await deployTenantApp({ tenantId: tenant.id });
      setDeployStatus('success');
      setDeployMessage(result?.message ?? 'Deploy app engine hoàn tất');
      toast.success('Deploy app engine thành công', {
        description: result?.data?.commandUsed
          ? `Đã chạy: ${result.data.commandUsed}`
          : 'Rocket.Chat App Engine đã được deploy.',
      });
      void loadTenant();
    } catch (error) {
      if (!handleAuthError(error)) {
        const text = error instanceof ApiError ? error.message : 'Deploy failed';
        setDeployStatus('error');
        setDeployMessage(text);
        toast.error('Deploy app engine thất bại', { description: text });
      }
    }
  }, [tenant, loadTenant, handleAuthError]);

  // teams table state
  const [teamsPage, setTeamsPage] = useState(1);
  const [teamsPageSize] = useState(10);
  const [teamsData, setTeamsData] = useState<any | null>(null);
  const [teamsLoading, setTeamsLoading] = useState(false);

  // users table state
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize] = useState(10);
  const [usersData, setUsersData] = useState<any | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);

  // team members modal
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [membersPage, setMembersPage] = useState(1);
  const [membersPageSize] = useState(10);
  const [membersData, setMembersData] = useState<any | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);

  // sync states
  const [syncUsersLoading, setSyncUsersLoading] = useState(false);
  const [syncTeamsLoading, setSyncTeamsLoading] = useState(false);

  const loadTeams = useCallback(async () => {
    if (!tenant) return;
    setTeamsLoading(true);
    try {
      const data = await getTenantTeams(tenant.id, { page: teamsPage, pageSize: teamsPageSize });
      setTeamsData(data);
    } catch (error) {
      if (!handleAuthError(error)) {
        // silently ignore other errors
      }
    } finally {
      setTeamsLoading(false);
    }
  }, [tenant, teamsPage, teamsPageSize, handleAuthError]);

  const loadUsers = useCallback(async () => {
    if (!tenant) return;
    setUsersLoading(true);
    try {
      const data = await getTenantUsers(tenant.id, { page: usersPage, pageSize: usersPageSize });
      setUsersData(data);
    } catch (error) {
      if (!handleAuthError(error)) {
        // silently ignore other errors
      }
    } finally {
      setUsersLoading(false);
    }
  }, [tenant, usersPage, usersPageSize, handleAuthError]);

  const loadMembers = useCallback(async () => {
    if (!selectedTeamId) return;
    setMembersLoading(true);
    try {
      const data = await getTeamMembers(selectedTeamId, { page: membersPage, pageSize: membersPageSize });
      setMembersData(data);
    } catch (error) {
      if (!handleAuthError(error)) {
        // silently ignore other errors
      }
    } finally {
      setMembersLoading(false);
    }
  }, [selectedTeamId, membersPage, membersPageSize, handleAuthError]);

  // Handlers that depend on loadTeams/loadUsers
  const submitCreateTeam = useCallback(async () => {
    if (!tenant) return;
    try {
      const channels = Array.from(selectedChannels);

      await createTeamWithChannels({ tenantId: tenant.id, roomName: teamForm.roomName, channelsName: channels });
      toast.success('Team created');
      setCreateTeamOpen(false);
      setTeamForm({ roomName: '' });
      setSelectedChannels(new Set());
      setCustomChannels([]);
      setNewChannel('');
      void loadTeams();
    } catch (error) {
      if (!handleAuthError(error)) {
        const text = error instanceof ApiError ? error.message : 'Create team failed';
        toast.error('Create team failed', { description: text });
      }
    }
  }, [teamForm, tenant, loadTeams, handleAuthError]);

  const submitImportUsers = useCallback(async () => {
    if (!tenant || !importFile) return;
    try {
      const result = await importUsers(importFile, tenant.id);
      toast.success('Import completed', { description: result?.message ?? '' });
      setImportOpen(false);
      setImportFile(null);
      void loadUsers();
    } catch (error) {
      if (!handleAuthError(error)) {
        const text = error instanceof ApiError ? error.message : 'Import failed';
        toast.error('Import failed', { description: text });
      }
    }
  }, [importFile, tenant, loadUsers, handleAuthError]);

  const submitCreateOrUpdateUser = useCallback(async () => {
    if (!tenant) return;
    try {
      if (editingUser) {
        await updateUser(editingUser.id, { ...userForm, tenantId: tenant.id });
        toast.success('User updated');
      } else {
        await createUser({ ...userForm, tenantId: tenant.id });
        toast.success('User created');
      }
      setUserFormOpen(false);
      setEditingUser(null);
      void loadUsers();
    } catch (error) {
      if (!handleAuthError(error)) {
        const text = error instanceof ApiError ? error.message : 'Save user failed';
        toast.error('Save user failed', { description: text });
      }
    }
  }, [editingUser, userForm, tenant, loadUsers, handleAuthError]);

  const handleEditUser = useCallback((u: any) => {
    setEditingUser(u);
    setUserForm({ name: u.name ?? '', username: u.username ?? '', email: u.email ?? '', role: u.role ?? undefined, phoneNumber: u.phoneNumber ?? '', citizenId: u.citizenId ?? '', address: u.address ?? '', dateOfBirth: u.dateOfBirth ?? '', avatarUrl: u.avatarUrl ?? '' });
    setUserFormOpen(true);
  }, []);

  const handleRemoveUser = useCallback(async (id: string) => {
    if (!confirm('Delete user?')) return;
    try {
      await deleteUser(id);
      toast.success('User deleted');
      void loadUsers();
    } catch (error) {
      if (!handleAuthError(error)) {
        const text = error instanceof ApiError ? error.message : 'Delete failed';
        toast.error('Delete failed', { description: text });
      }
    }
  }, [loadUsers, handleAuthError]);

  const handleSyncUsers = useCallback(async () => {
    if (!tenant) return;
    setSyncUsersLoading(true);
    try {
      const result = await syncTenantUsersFromRocket(tenant.id);
      toast.success('Đồng bộ users từ Rocket.Chat thành công', {
        description: result?.syncedCount ? `Đã đồng bộ ${result.syncedCount} user` : 'Hoàn tất',
      });
      void loadUsers();
    } catch (error) {
      if (!handleAuthError(error)) {
        const text = error instanceof ApiError ? error.message : 'Sync failed';
        toast.error('Không thể đồng bộ users', { description: text });
      }
    } finally {
      setSyncUsersLoading(false);
    }
  }, [tenant, loadUsers, handleAuthError]);

  const handleSyncTeams = useCallback(async () => {
    if (!tenant) return;
    setSyncTeamsLoading(true);
    try {
      const result = await syncTeamMembershipsFromRocket(tenant.id);
      toast.success('Đồng bộ team memberships từ Rocket.Chat thành công', {
        description: result?.syncedCount ? `Đã đồng bộ ${result.syncedCount} user` : 'Hoàn tất',
      });
      void loadTeams();
    } catch (error) {
      if (!handleAuthError(error)) {
        const text = error instanceof ApiError ? error.message : 'Sync failed';
        toast.error('Không thể đồng bộ teams', { description: text });
      }
    } finally {
      setSyncTeamsLoading(false);
    }
  }, [tenant, loadTeams, handleAuthError]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (createTeamOpen) {
      setTeamForm({ roomName: '' });
      setSelectedChannels(new Set(DEFAULT_CHANNELS));
      setCustomChannels([]);
      setNewChannel('');
    }
  }, [createTeamOpen]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const handleDelete = async () => {
    setIsDeleteLoading(true);

    try {
      await deleteTenant({ tenantId });
      toast.success('Tenant đã được xoá');
      router.push('/dashboard');
    } catch (error) {
      if (!handleAuthError(error)) {
        const text = error instanceof ApiError ? error.message : 'Delete failed';
        toast.error('Không thể xoá tenant', { description: text });
        setMessage(text);
      }
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
            {currentUser?.role === 'SUPER_ADMIN' ? (
              <Button
                variant="secondary"
                onClick={handleDeployAppEngine}
                disabled={deployStatus === 'loading' || actionLoading !== null}
                icon={deployStatus === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              >
                {deployStatus === 'loading'
                  ? 'Đang deploy...'
                  : deployStatus === 'success'
                    ? 'Deploy lại app engine'
                    : 'Deploy app engine'}
              </Button>
            ) : null}
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
            {currentUser?.role === 'SUPER_ADMIN' ? (
              <Button onClick={() => setIsDeleteDialogOpen(true)} disabled={actionLoading !== null}>
                Xoá tenant
              </Button>
            ) : null}
          </div>
        </div>

        {message ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {message}
          </div>
        ) : null}

        {deployStatus !== 'idle' ? (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
              deployStatus === 'loading'
                ? 'border-sky-200 bg-sky-50 text-sky-800'
                : deployStatus === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {deployStatus === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : deployStatus === 'success' ? (
                  <CircleCheckBig className="h-4 w-4" />
                ) : (
                  <ShieldAlert className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {deployStatus === 'loading'
                    ? 'Deploy app engine đang chạy'
                    : deployStatus === 'success'
                      ? 'Deploy app engine thành công'
                      : 'Deploy app engine thất bại'}
                </p>
                <p className="mt-1 break-words text-sm opacity-90">
                  {deployMessage ?? 'Không có thông tin bổ sung'}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* Create Team Modal */}
      {createTeamOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/40">
          <div className="w-[90%] max-w-2xl rounded-2xl bg-white p-6 overflow-auto">
            <h3 className="text-lg font-semibold">Tạo team</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium">Tên team</label>
                <input
                  value={teamForm.roomName}
                  onChange={(e) => setTeamForm((s) => ({ ...s, roomName: e.target.value }))}
                  className="mt-1 w-full rounded-md border px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Chọn kênh (có thể chọn nhiều)</label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {DEFAULT_CHANNELS.map((ch) => (
                    <label key={ch} className="inline-flex items-center gap-2 rounded-md border px-2 py-1">
                      <input
                        type="checkbox"
                        checked={selectedChannels.has(ch)}
                        onChange={() => {
                          const s = new Set(selectedChannels);
                          if (s.has(ch)) {
                            s.delete(ch);
                          } else {
                            s.add(ch);
                          }
                          setSelectedChannels(s);
                        }}
                      />
                      <span className="text-sm">{ch}</span>
                    </label>
                  ))}
                </div>
              </div>

              {customChannels.length > 0 && (
                <div>
                  <label className="text-sm font-medium">Lựa chọn thêm</label>
                  <div className="mt-2 flex flex-col gap-2">
                    {customChannels.map((ch) => (
                      <label key={ch} className="inline-flex items-center gap-2 rounded-md border px-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedChannels.has(ch)}
                          onChange={() => {
                            const s = new Set(selectedChannels);
                            if (s.has(ch)) s.delete(ch); else s.add(ch);
                            setSelectedChannels(s);
                          }}
                        />
                        <span className="text-sm">{ch}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 items-center">
                <input
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value)}
                  placeholder="Thêm lựa chọn khác"
                  className="flex-1 rounded-md border px-3 py-2"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    const v = newChannel.trim();
                    if (!v) return;
                    if (DEFAULT_CHANNELS.includes(v) || customChannels.includes(v)) {
                      setNewChannel('');
                      return;
                    }
                    setCustomChannels((s) => [...s, v]);
                    const setSel = new Set(selectedChannels);
                    setSel.add(v);
                    setSelectedChannels(setSel);
                    setNewChannel('');
                  }}
                >
                  Thêm lựa chọn
                </Button>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" onClick={() => setCreateTeamOpen(false)}>Hủy</Button>
              <Button size="sm" onClick={submitCreateTeam}>Tạo</Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Tenant Admin Modal */}
      {createTenantAdminOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[90%] max-w-md rounded-2xl bg-white p-6">
            <h3 className="text-lg font-semibold">Tạo admin tenant</h3>
            <div className="mt-4 space-y-3">
              <input placeholder="Email" value={tenantAdminForm.email} onChange={(e) => setTenantAdminForm((s) => ({ ...s, email: e.target.value }))} className="w-full rounded-md border px-3 py-2" />
              <input placeholder="Tên đăng nhập" value={tenantAdminForm.username} onChange={(e) => setTenantAdminForm((s) => ({ ...s, username: e.target.value }))} className="w-full rounded-md border px-3 py-2" />
              <input placeholder="Mật khẩu" type="password" value={tenantAdminForm.password} onChange={(e) => setTenantAdminForm((s) => ({ ...s, password: e.target.value }))} className="w-full rounded-md border px-3 py-2" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" onClick={() => setCreateTenantAdminOpen(false)}>Hủy</Button>
              <Button size="sm" onClick={async () => {
                try {
                  await createTenantAdmin(tenantId, tenantAdminForm);
                  toast.success('Đã tạo admin tenant');
                  setCreateTenantAdminOpen(false);
                  void loadTenant();
                } catch (error) {
                  const text = error instanceof ApiError ? error.message : 'Không thể tạo admin';
                  toast.error('Không thể tạo admin', { description: text });
                }
              }}>Tạo</Button>
            </div>
          </div>
        </div>
      )}

      {/* Import Users Modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[90%] max-w-md rounded-2xl bg-white p-6">
            <h3 className="text-lg font-semibold">Import users</h3>
            <p className="mt-2 text-sm text-slate-500">Upload an Excel file (.xlsx) with required columns: name,email,username,password</p>
            <div className="mt-4">
              <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" onClick={() => { setImportOpen(false); setImportFile(null); }}>Cancel</Button>
              <Button size="sm" onClick={submitImportUsers} disabled={!importFile}>Upload</Button>
            </div>
          </div>
        </div>
      )}

      {/* User Create/Edit Modal */}
      {userFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[95%] max-w-2xl rounded-2xl bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{editingUser ? 'Edit user' : 'Create user'}</h3>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => { setUserFormOpen(false); setEditingUser(null); }}>Close</Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input placeholder="Name" value={userForm.name} onChange={(e) => setUserForm((s) => ({ ...s, name: e.target.value }))} className="rounded-md border px-3 py-2" />
              <input placeholder="Username" value={userForm.username} onChange={(e) => setUserForm((s) => ({ ...s, username: e.target.value }))} className="rounded-md border px-3 py-2" />
              <input placeholder="Email" value={userForm.email} onChange={(e) => setUserForm((s) => ({ ...s, email: e.target.value }))} className="rounded-md border px-3 py-2" />
              <input placeholder="Phone" value={userForm.phoneNumber} onChange={(e) => setUserForm((s) => ({ ...s, phoneNumber: e.target.value }))} className="rounded-md border px-3 py-2" />
              <input placeholder="Citizen ID" value={userForm.citizenId} onChange={(e) => setUserForm((s) => ({ ...s, citizenId: e.target.value }))} className="rounded-md border px-3 py-2" />
              <input placeholder="Address" value={userForm.address} onChange={(e) => setUserForm((s) => ({ ...s, address: e.target.value }))} className="rounded-md border px-3 py-2" />
              <input placeholder="Date of birth (YYYY-MM-DD)" value={userForm.dateOfBirth} onChange={(e) => setUserForm((s) => ({ ...s, dateOfBirth: e.target.value }))} className="rounded-md border px-3 py-2" />
              <input placeholder="Avatar URL" value={userForm.avatarUrl} onChange={(e) => setUserForm((s) => ({ ...s, avatarUrl: e.target.value }))} className="rounded-md border px-3 py-2" />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              {editingUser ? <Button size="sm" onClick={() => { setEditingUser(null); setUserFormOpen(false); }}>Cancel</Button> : <Button size="sm" onClick={() => { setUserFormOpen(false); }}>Cancel</Button>}
              <Button size="sm" onClick={submitCreateOrUpdateUser}>{editingUser ? 'Save' : 'Create'}</Button>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-container">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
          <Layers3 className="h-4 w-4" />
          Tổng quan
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            <ShieldCheck className="h-4 w-4" />
            Teams Rocket.Chat
          </div>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              onClick={handleSyncTeams} 
              disabled={syncTeamsLoading}
              className="whitespace-nowrap"
            >
              {syncTeamsLoading ? 'Đang đồng bộ...' : 'Đồng bộ từ Rocket'}
            </Button>
            <Button size="sm" onClick={() => setCreateTeamOpen(true)} className="whitespace-nowrap">Tạo team</Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-3 py-2">Tên</th>
                <th className="px-3 py-2">Room ID</th>
                <th className="px-3 py-2">Team ID</th>
                <th className="px-3 py-2">Mã tham gia</th>
                <th className="px-3 py-2">Thành viên</th>
                <th className="px-3 py-2">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {teamsData?.items?.length > 0 ? (
                teamsData.items.map((t: any) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-3">{t.name || 'Unnamed'}</td>
                    <td className="px-3 py-3">{t.roomId}</td>
                    <td className="px-3 py-3">{t.teamId}</td>
                    <td className="px-3 py-3 font-mono text-xs tracking-[0.12em] text-slate-700">{t.joinCode || '-'}</td>
                    <td className="px-3 py-3">{t.memberCount ?? t._count?.members ?? 0}</td>
                    <td className="px-3 py-3">
                      <Button size="sm" onClick={() => { setSelectedTeamId(t.id); setMembersModalOpen(true); setMembersPage(1); }}>View members</Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">Chưa có team</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-slate-500">Trang {teamsData?.pagination?.page || 1} / {teamsData?.pagination?.totalPages || 1}</div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setTeamsPage((p) => Math.max(1, p - 1))} disabled={teamsLoading || (teamsData?.pagination?.page || 1) <= 1}>Trước</Button>
            <Button size="sm" onClick={() => setTeamsPage((p) => p + 1)} disabled={teamsLoading || (teamsData?.pagination?.page || 1) >= (teamsData?.pagination?.totalPages || 1)}>Sau</Button>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-container">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            <ShieldCheck className="h-4 w-4" />
            Admin tenant
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setCreateTenantAdminOpen(true)}>Thêm admin tenant</Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-3 py-2">Tên đăng nhập</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Tạo lúc</th>
              </tr>
            </thead>
            <tbody>
              {tenant.tenantAdmins?.length > 0 ? (
                tenant.tenantAdmins.map((admin) => (
                  <tr key={admin.id} className="border-t">
                    <td className="px-3 py-3">{admin.username}</td>
                    <td className="px-3 py-3">{admin.email}</td>
                    <td className="px-3 py-3">{admin.role}</td>
                    <td className="px-3 py-3">{admin.isActive ? 'Đang hoạt động' : 'Đã khóa'}</td>
                    <td className="px-3 py-3">{formatDate(admin.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">Chưa có admin tenant</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-container">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Users className="h-4 w-4" />
            Users Rocket.Chat
          </div>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              onClick={handleSyncUsers} 
              disabled={syncUsersLoading}
              className="whitespace-nowrap"
            >
              {syncUsersLoading ? 'Đang đồng bộ...' : 'Đồng bộ từ Rocket'}
            </Button>
            <Button size="sm" onClick={() => setImportOpen(true)}>Import user</Button>
            <Button size="sm" onClick={() => { setEditingUser(null); setUserForm({ name: '', username: '', email: '', role: undefined, phoneNumber: '', citizenId: '', address: '', dateOfBirth: '', avatarUrl: '' }); setUserFormOpen(true); }}>Thêm user</Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-3 py-2">Tên</th>
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Rocket ID</th>
                <th className="px-3 py-2">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {usersData?.items?.length > 0 ? (
                usersData.items.map((u: any) => (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-3">{u.name || u.username}</td>
                    <td className="px-3 py-3">{u.username}</td>
                    <td className="px-3 py-3">{u.email || 'N/A'}</td>
                    <td className="px-3 py-3">{u.role || 'N/A'}</td>
                    <td className="px-3 py-3">{u.rocketUserId || '-'}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleEditUser(u)}>Edit</Button>
                        <Button size="sm" onClick={() => handleRemoveUser(u.id)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500">Chưa có user</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-slate-500">Trang {usersData?.pagination?.page || 1} / {usersData?.pagination?.totalPages || 1}</div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setUsersPage((p) => Math.max(1, p - 1))} disabled={usersLoading || (usersData?.pagination?.page || 1) <= 1}>Trước</Button>
            <Button size="sm" onClick={() => setUsersPage((p) => p + 1)} disabled={usersLoading || (usersData?.pagination?.page || 1) >= (usersData?.pagination?.totalPages || 1)}>Sau</Button>
          </div>
        </div>
      </section>

      {/* Team members modal */}
      {membersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[90%] max-w-2xl rounded-2xl bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Team members</h3>
              <div className="flex items-center gap-2">
                <div className="text-sm text-slate-500">Page {membersData?.pagination?.page || 1} / {membersData?.pagination?.totalPages || 1}</div>
                <Button size="sm" onClick={() => setMembersPage((p) => Math.max(1, p - 1))} disabled={membersLoading || (membersData?.pagination?.page || 1) <= 1}>Prev</Button>
                <Button size="sm" onClick={() => setMembersPage((p) => p + 1)} disabled={membersLoading || (membersData?.pagination?.page || 1) >= (membersData?.pagination?.totalPages || 1)}>Next</Button>
                <Button size="sm" onClick={() => { setMembersModalOpen(false); setSelectedTeamId(null); }}>Close</Button>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full table-auto text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Username</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {membersData?.items?.length > 0 ? (
                    membersData.items.map((m: any) => (
                      <tr key={m.id} className="border-t">
                        <td className="px-3 py-3">{m.user?.name || m.user?.username}</td>
                        <td className="px-3 py-3">{m.user?.username}</td>
                        <td className="px-3 py-3">{m.user?.email || 'N/A'}</td>
                        <td className="px-3 py-3">{m.user?.role || 'N/A'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-500">No members</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={isDeleteDialogOpen}
        title="Xoá tenant"
        description={`Xoá ${tenant.name}? Hành động này sẽ thu hồi truy cập và đánh dấu để dọn dẹp.`}
        confirmText={isDeleteLoading ? 'Đang xoá...' : 'Xoá tenant'}
        cancelText="Hủy"
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
