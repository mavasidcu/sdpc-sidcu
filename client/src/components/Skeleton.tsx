interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded-lg bg-slate-200/60 ${className}`} />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-5 w-16 rounded-lg" />
      </div>
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-2/3" />
      <div className="mt-4 flex items-center gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-5 w-20 rounded-md" />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <Skeleton className="h-6 w-11 rounded-full" />
        <div className="flex gap-1">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-7 w-7 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-slate-50 px-4 py-3">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 3 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="mt-1 h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-2 h-3 w-64" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>
      <SkeletonStats />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
