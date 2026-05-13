"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { login, setStoredToken, getStoredToken, ApiError } from '@/services/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getStoredToken()) {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const session = await login({ identifier: email, password });
      setStoredToken(session.token);
      toast.success('Đăng nhập thành công', {
        description: 'Đang chuyển đến trang quản trị...',
      });
      router.replace('/dashboard');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không thể đăng nhập';
      setError(message);
      toast.error('Đăng nhập thất bại', { description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white/90 p-8 shadow-container backdrop-blur-xl sm:p-10">
        <div className="mb-8 space-y-3 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-[1.4rem] bg-primary text-white shadow-lg shadow-primary/20">
            WT
          </div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-slate-950">
            Đăng nhập WeTeams
          </h1>
          <p className="text-sm leading-6 text-slate-500">
            Dùng tài khoản quản trị để vào trang quản trị.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field>
            <label htmlFor="email">Email hoặc tên đăng nhập</label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
              placeholder="Nhập tên đăng nhập hoặc email"
              autoComplete="username"
            />
          </Field>

          <Field>
            <label htmlFor="password">Mật khẩu</label>
            <div className="relative mt-2">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary/30 focus:ring-4 focus:ring-primary/10"
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <Button className="w-full" size="lg" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Field({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M2.25 12s3.5-6.75 9.75-6.75S21.75 12 21.75 12 18.25 18.75 12 18.75 2.25 12 2.25 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.58 6.02A10.76 10.76 0 0 1 12 5.25c6.25 0 9.75 6.75 9.75 6.75a16.5 16.5 0 0 1-4.1 4.92" />
      <path d="M6.65 6.67C4.17 8.36 2.75 12 2.75 12s3.5 6.75 9.75 6.75a9.9 9.9 0 0 0 4.04-.82" />
      <path d="M9.88 9.9a3 3 0 0 0 4.22 4.22" />
    </svg>
  );
}
