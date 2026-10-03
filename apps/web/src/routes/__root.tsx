import { createRootRoute, Link, Outlet } from '@tanstack/react-router';

const NAV = [
  { to: '/', label: '제품 추적' },
  { to: '/register', label: '제품 등록' },
  { to: '/stock', label: '재고' },
  { to: '/orders', label: '주문' },
  { to: '/purchase-orders', label: '발주' },
  { to: '/shipments', label: '선적' },
] as const;

export const Route = createRootRoute({
  component: () => (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2">
        <h1 className="text-lg font-bold">Logistics Hub</h1>
        <nav className="flex gap-4 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-slate-500 hover:text-slate-900"
              activeProps={{ className: 'font-semibold text-slate-900' }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="space-y-4">
        <Outlet />
      </main>
    </div>
  ),
});
