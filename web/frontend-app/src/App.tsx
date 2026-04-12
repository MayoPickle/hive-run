import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import { ToastProvider } from './components/Toast';
import DashboardPage from './pages/DashboardPage';
import TestPage from './pages/TestPage';
import SchedulesPage from './pages/SchedulesPage';
import MonitorsPage from './pages/MonitorsPage';
import HistoryPage from './pages/HistoryPage';

export default function App() {
  return (
    <ToastProvider>
      <div className="h-full flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-screen-xl mx-auto px-6 py-8 w-full">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/test" element={<TestPage />} />
            <Route path="/schedules" element={<SchedulesPage />} />
            <Route path="/monitors" element={<MonitorsPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
