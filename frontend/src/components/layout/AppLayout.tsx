import { Link, Outlet, useLocation } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';

const NAV_ITEMS = [
  { path: '/', label: 'Token Usage' },
  { path: '/analytics', label: 'Analytics' },
];

export function AppLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="mx-auto max-w-4xl px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-8">
            <Link to="/" className="text-base sm:text-lg font-light tracking-tight text-foreground no-underline">
              Jacky
            </Link>
            <nav className="flex items-center gap-3 sm:gap-6">
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
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-xs text-muted-foreground hidden sm:inline">
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
      <main className="mx-auto max-w-4xl w-full px-4 sm:px-8 py-6 sm:py-8 flex-1">
        <Outlet />
      </main>
      <footer className="border-t">
        <div className="mx-auto max-w-4xl px-4 sm:px-8 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            Made with ❤️
          </p>
          <a
            href="https://jacky.jp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors no-underline mt-1 inline-block"
          >
            jacky.jp
          </a>
        </div>
      </footer>
    </div>
  );
}
