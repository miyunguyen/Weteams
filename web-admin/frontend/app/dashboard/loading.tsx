export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-56 rounded-2xl bg-slate-200" />
      <div className="h-16 rounded-2xl bg-slate-200" />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-56 rounded-[1.75rem] bg-slate-200" />
        ))}
      </div>
    </div>
  );
}
