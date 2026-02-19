import { Link, Outlet, useLocation } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard' },
  { path: '/analytics', label: 'Analytics' },
];

export function AppLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-4xl px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-lg font-light tracking-tight text-foreground no-underline">
              Token Matters
            </Link>
            <nav className="flex items-center gap-6">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'text-sm no-underline transition-colors',
                    location.pathname === item.path
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">
              {dayjs().format('MMM YYYY')}
            </span>
            <Link
              to="/settings"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
