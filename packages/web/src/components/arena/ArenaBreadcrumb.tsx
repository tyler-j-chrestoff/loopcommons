'use client';

export type Crumb = {
  label: string;
  href?: string;
};

export function ArenaBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs mb-4">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="opacity-30">/</span>}
          {crumb.href ? (
            <a
              href={crumb.href}
              className="opacity-50 hover:opacity-100 transition-opacity"
            >
              {crumb.label}
            </a>
          ) : (
            <span className="opacity-70">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
