"use client";

import type { ReactNode } from 'react';
import { Button } from './Button';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  loading = false,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[1.75rem] border border-white/70 bg-white p-6 shadow-2xl sm:p-7">
        <h3 className="font-heading text-2xl font-semibold tracking-tight text-slate-950">
          {title}
        </h3>

        {description ? (
          <div className="mt-2 text-sm leading-6 text-slate-600">{description}</div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={onCancel} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={destructive ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-300' : ''}
          >
            {loading ? 'Please wait...' : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}