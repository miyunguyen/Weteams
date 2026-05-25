"use client";

import { Button } from '@/components/ui/Button';

export type TenantTeamMemberUser = {
  name?: string | null;
  username?: string | null;
  email?: string | null;
  role?: string | null;
};

export type TenantTeamMembersData = {
  items?: Array<{
    id: string;
    user?: TenantTeamMemberUser | null;
  }>;
  pagination?: {
    page?: number;
    totalPages?: number;
  };
};

type TenantTeamMembersModalProps = {
  open: boolean;
  membersData: TenantTeamMembersData | null;
  membersLoading: boolean;
  onClose: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
};

export function TenantTeamMembersModal({
  open,
  membersData,
  membersLoading,
  onClose,
  onPrevPage,
  onNextPage,
}: TenantTeamMembersModalProps) {
  if (!open) {
    return null;
  }

  const page = membersData?.pagination?.page || 1;
  const totalPages = membersData?.pagination?.totalPages || 1;
  const members = membersData?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[90%] max-w-2xl rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Team members</h3>
          <div className="flex items-center gap-2">
            <div className="text-sm text-slate-500">Page {page} / {totalPages}</div>
            <Button size="sm" onClick={onPrevPage} disabled={membersLoading || page <= 1}>Prev</Button>
            <Button size="sm" onClick={onNextPage} disabled={membersLoading || page >= totalPages}>Next</Button>
            <Button size="sm" onClick={onClose}>Close</Button>
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
              {members.length > 0 ? (
                members.map((member) => (
                  <tr key={member.id} className="border-t">
                    <td className="px-3 py-3">{member.user?.name || member.user?.username}</td>
                    <td className="px-3 py-3">{member.user?.username}</td>
                    <td className="px-3 py-3">{member.user?.email || 'N/A'}</td>
                    <td className="px-3 py-3">{member.user?.role || 'N/A'}</td>
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
  );
}
