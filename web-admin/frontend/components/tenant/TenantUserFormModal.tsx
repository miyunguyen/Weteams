"use client";

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export type TenantUserFormState = {
  name: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
  phoneNumber: string;
  citizenId: string;
  address: string;
  dateOfBirth: string;
};

export function createEmptyTenantUserForm(): TenantUserFormState {
  return {
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: '',
    phoneNumber: '',
    citizenId: '',
    address: '',
    dateOfBirth: '',
  };
}

type TenantUserFormModalProps = {
  open: boolean;
  editingUser: unknown | null;
  form: TenantUserFormState;
  setForm: Dispatch<SetStateAction<TenantUserFormState>>;
  onClose: () => void;
  onSubmit: () => void;
};

export function TenantUserFormModal({
  open,
  editingUser,
  form,
  setForm,
  onClose,
  onSubmit,
}: TenantUserFormModalProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  if (!open) {
    return null;
  }

  const isEditing = Boolean(editingUser);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[95%] max-w-2xl rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{isEditing ? 'Chỉnh sửa user' : 'Tạo user mới'}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {isEditing
                ? 'Cập nhật thông tin hồ sơ cho user.'
                : 'Nhập đầy đủ thông tin để tạo user và đồng thời tạo tài khoản Rocket.Chat.'}
            </p>
          </div>
          <Button size="sm" onClick={onClose}>Đóng</Button>
        </div>

        <div className="mt-4 space-y-5">
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Thông tin cơ bản</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Họ và tên</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Nguyễn Văn A"
                  className="w-full rounded-md border px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Tên đăng nhập</span>
                <input
                  value={form.username}
                  onChange={(e) => setForm((s) => ({ ...s, username: e.target.value }))}
                  placeholder="nguyenvana"
                  className="w-full rounded-md border px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                  placeholder="name@example.com"
                  className="w-full rounded-md border px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Vai trò</span>
                <select
                  value={form.role}
                  onChange={(e) => setForm((s) => ({ ...s, role: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2"
                >
                  <option value="">Không chọn</option>
                  <option value="TEACHER">TEACHER</option>
                  <option value="STUDENT">STUDENT</option>
                  <option value="PARENT">PARENT</option>
                </select>
              </label>
            </div>
          </div>

          {!isEditing ? (
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Bảo mật</h4>
              <p className="mt-1 text-sm text-slate-500">Mật khẩu này sẽ được dùng để tạo user trên Rocket.Chat.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Mật khẩu</span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                      placeholder="••••••••"
                      className="w-full rounded-md border px-3 py-2 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 transition hover:text-slate-700"
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Xác nhận mật khẩu</span>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={form.confirmPassword}
                      onChange={(e) => setForm((s) => ({ ...s, confirmPassword: e.target.value }))}
                      placeholder="••••••••"
                      className="w-full rounded-md border px-3 py-2 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 transition hover:text-slate-700"
                      aria-label={showConfirmPassword ? 'Ẩn xác nhận mật khẩu' : 'Hiện xác nhận mật khẩu'}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Khi chỉnh sửa user, password Rocket.Chat không thay đổi từ form này.
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Thông tin bổ sung</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Số điện thoại</span>
                <input
                  value={form.phoneNumber}
                  onChange={(e) => setForm((s) => ({ ...s, phoneNumber: e.target.value }))}
                  placeholder="0901234567"
                  className="w-full rounded-md border px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Ngày sinh</span>
                <input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => setForm((s) => ({ ...s, dateOfBirth: e.target.value }))}
                  className="w-full rounded-md border px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Căn cước công dân</span>
                <input
                  value={form.citizenId}
                  onChange={(e) => setForm((s) => ({ ...s, citizenId: e.target.value }))}
                  placeholder="012345678901"
                  className="w-full rounded-md border px-3 py-2"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Địa chỉ</span>
                <input
                  value={form.address}
                  onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
                  placeholder="Số nhà, đường, phường, quận..."
                  className="w-full rounded-md border px-3 py-2"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Hủy</Button>
          <Button size="sm" onClick={onSubmit}>{isEditing ? 'Lưu' : 'Tạo user'}</Button>
        </div>
      </div>
    </div>
  );
}
