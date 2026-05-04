export default function TenantDetailLoading() {
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
