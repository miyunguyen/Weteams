"use client";

export default function TenantDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-[1.75rem] border border-rose-200 bg-white p-6 shadow-container">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-600">
        Error
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        Tenant detail failed to load
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{error.message}</p>
      <button
        onClick={reset}
        className="mt-6 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
