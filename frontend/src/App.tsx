import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { TokenSetupModal } from '@/components/shared/TokenSetupModal';
import { ApiAuthError, getCredentials } from '@/services/api';

const ProviderPage = lazy(() =>
  import('@/features/providers/ProviderPage').then((m) => ({ default: m.ProviderPage })),
);
const MachinePage = lazy(() =>
  import('@/features/machines/MachinePage').then((m) => ({ default: m.MachinePage })),
);
const AnalyticsPage = lazy(() =>
  import('@/features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

function PageFallback() {
  return <LoadingSkeleton lines={6} className="py-8" />;
}

export default function App() {
  // Two distinct prompt triggers: (a) no creds in localStorage on
  // first load, (b) the backend rejected the stored pair (token
  // revoked, user disabled, mistyped on entry). We capture (b) via
  // a window-level event on `unhandledrejection` so we don't have
  // to thread a callback through every page that might fetch.
  const [needsSetup, setNeedsSetup] = useState<{ message?: string } | null>(
    getCredentials() ? null : { message: undefined },
  );

  useEffect(() => {
    function onRejection(e: PromiseRejectionEvent) {
      if (e.reason instanceof ApiAuthError) {
        setNeedsSetup({ message: 'That user/token pair was rejected. Try again.' });
        e.preventDefault();
      }
    }
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  if (needsSetup) {
    return (
      <TokenSetupModal
        message={needsSetup.message}
        onSave={() => {
          // Reload — easier than threading invalidation through
          // every cache and store. Fresh start, fresh fetches.
          window.location.reload();
        }}
      />
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route
            path="providers/:id"
            element={<Suspense fallback={<PageFallback />}><ProviderPage /></Suspense>}
          />
          <Route
            path="machines/:id"
            element={<Suspense fallback={<PageFallback />}><MachinePage /></Suspense>}
          />
          <Route
            path="analytics"
            element={<Suspense fallback={<PageFallback />}><AnalyticsPage /></Suspense>}
          />
          <Route
            path="settings"
            element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
