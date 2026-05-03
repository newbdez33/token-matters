import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import { TokenSetupModal } from '@/components/shared/TokenSetupModal';
import {
  getCredentials,
  onAuthError,
  clearCredentials,
  hasEnvCredentials,
} from '@/services/api';
import { ErrorMessage } from '@/components/shared/ErrorMessage';

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
  // Three setup states:
  //   - null         → creds present and valid (so far), render the app
  //   - { ... }      → no creds OR the backend rejected them; show modal
  //                    or, when env creds are baked in, show an error
  //                    banner instead (the modal can't help — rotation
  //                    means redeploying with a new VITE_TB_TOKEN).
  // Build-time creds (VITE_TB_USER / VITE_TB_TOKEN) skip the initial
  // localStorage check entirely so a fresh browser doesn't hit the
  // sign-in modal on first load — that's the whole point of env creds.
  const [needsSetup, setNeedsSetup] = useState<{ message?: string } | null>(
    getCredentials() ? null : { message: undefined },
  );

  useEffect(() => {
    return onAuthError(() => {
      // With env creds, clearing localStorage is a no-op for the
      // active session (env wins anyway). Skip it to avoid wiping
      // a leftover localStorage pair the user might want to keep.
      if (!hasEnvCredentials()) clearCredentials();
      setNeedsSetup({
        message: hasEnvCredentials()
          ? 'The build-time VITE_TB_TOKEN was rejected. Redeploy with a fresh token.'
          : 'That user/token pair was rejected. Try again.',
      });
    });
  }, []);

  if (needsSetup) {
    if (hasEnvCredentials()) {
      // Don't render the modal: nothing the user types here can
      // override the bundled VITE_TB_TOKEN. Show the rejection
      // reason as a plain error so they know to redeploy.
      return (
        <div className="max-w-md mx-auto pt-24 px-4">
          <ErrorMessage
            message={
              needsSetup.message ?? 'No build-time credentials and no localStorage fallback.'
            }
          />
        </div>
      );
    }
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
