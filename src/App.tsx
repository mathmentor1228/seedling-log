import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import DashboardPage from "./pages/DashboardPage";
import StudentsPage from "./pages/StudentsPage";
import ClassesPage from "./pages/ClassesPage";
import LessonsPage from "./pages/LessonsPage";
import ReportsPage from "./pages/ReportsPage";
import WeeklyReportSendPage from "./pages/WeeklyReportSendPage";
import UserManagementPage from "./pages/UserManagementPage";
import TimetablePage from "./pages/TimetablePage";
import AssistantRequestsPage from "./pages/AssistantRequestsPage";
import AssistantPage from "./pages/AssistantPage";
import StatsPage from "./pages/StatsPage";
import AdminBriefingPage from "./pages/AdminBriefingPage";
import AdminReportPage from "./pages/AdminReportPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/lessons" element={<LessonsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/send" element={<WeeklyReportSendPage />} />
            <Route path="/admin/users" element={<UserManagementPage />} />
            <Route path="/timetable" element={<TimetablePage />} />
            <Route path="/assistant-requests" element={<AssistantRequestsPage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/admin/briefing" element={<AdminBriefingPage />} />
            <Route path="/admin/report" element={<AdminReportPage />} />
            <Route path="*" element={<NotFound />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
