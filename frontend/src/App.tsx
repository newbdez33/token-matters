import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { TokenSetupModal } from '@/components/shared/TokenSetupModal';
import { getCredentials, onAuthError, clearCredentials } from '@/services/api';

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
  // revoked, user disabled, mistyped on entry). For (b) we
  // subscribe to `onAuthError` from services/api — the first
  // iteration relied on `window.unhandledrejection`, but every
  // fetch path catches its own promise (data store, lazy pages),
  // so the rejection never escaped and the modal never reopened.
  const [needsSetup, setNeedsSetup] = useState<{ message?: string } | null>(
    getCredentials() ? null : { message: undefined },
  );

  useEffect(() => {
    return onAuthError(() => {
      // Wipe the rejected pair so a soft reload won't immediately
      // re-fail with the same creds and trap the user out.
      clearCredentials();
      setNeedsSetup({ message: 'That user/token pair was rejected. Try again.' });
    });
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
