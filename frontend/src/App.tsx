import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ProviderPage } from '@/features/providers/ProviderPage';
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

export default function App() {
  return (
    <BrowserRouter basename="/token-matters">
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="providers/:id" element={<ProviderPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
