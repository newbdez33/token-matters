import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';

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
