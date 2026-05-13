"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearStoredToken } from '@/services/api';
import { Button } from '@/components/ui/Button';

export function DashboardShell({ children }: { children: import('react').ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    clearStoredToken();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen bg-dashboard-glow">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-sm font-bold text-white shadow-lg shadow-primary/20">
              WT
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary/70">
                WeTeams
              </p>
              <h1 className="font-heading text-lg font-semibold tracking-tight text-slate-950">
                Admin Console
              </h1>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <div className="hidden rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 md:block">
              {pathname.startsWith('/dashboard/tenant') ? 'Chi tiết tenant' : 'Trang quản trị'}
            </div>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              Đăng xuất
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
