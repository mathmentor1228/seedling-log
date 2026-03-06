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

import UserManagementPage from "./pages/UserManagementPage";
import TimetablePage from "./pages/TimetablePage";
import AssistantRequestsPage from "./pages/AssistantRequestsPage";
import AssistantPage from "./pages/AssistantPage";
import StatsPage from "./pages/StatsPage";
import AdminBriefingPage from "./pages/AdminBriefingPage";
import AdminReportPage from "./pages/AdminReportPage";
import AdminDailyOpsPage from "./pages/AdminDailyOpsPage";
import ReportStatusPage from "./pages/ReportStatusPage";
import VocabTestPage from "./pages/VocabTestPage";
import VocabTestGeneratorPage from "./pages/VocabTestGeneratorPage";
import SchoolExamArchivePage from "./pages/SchoolExamArchivePage";
import NotFound from "./pages/NotFound";
import TrialSignup from "./pages/TrialSignup";
import PublicReport from "./pages/PublicReport";
import ParentPortal from "./pages/ParentPortal";
import { StudentAuthProvider } from "@/lib/studentAuth";
import StudentLogin from "./pages/student/StudentLogin";
import StudentDashboard from "./pages/student/StudentDashboard";
import StudentHomework from "./pages/student/StudentHomework";
import StudentPoints from "./pages/student/StudentPoints";
import StudentSchedule from "./pages/student/StudentSchedule";
import StudentFeedback from "./pages/student/StudentFeedback";
import { StudentLayout } from "@/components/student/StudentLayout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public route - NO AuthProvider, accessible without login */}
          <Route path="/report/view" element={<PublicReport />} />
          <Route path="/parent" element={<ParentPortal />} />
          <Route path="/trial" element={<TrialSignup />} />

          {/* All authenticated routes */}
          <Route path="/*" element={
            <AuthProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />

                {/* Student App Routes */}
                <Route path="/student/login" element={
                  <StudentAuthProvider><StudentLogin /></StudentAuthProvider>
                } />
                <Route path="/student" element={
                  <StudentAuthProvider><StudentLayout><StudentDashboard /></StudentLayout></StudentAuthProvider>
                } />
                <Route path="/student/homework" element={
                  <StudentAuthProvider><StudentLayout><StudentHomework /></StudentLayout></StudentAuthProvider>
                } />
                <Route path="/student/homework/:homeworkId" element={
                  <StudentAuthProvider><StudentLayout><StudentHomework /></StudentLayout></StudentAuthProvider>
                } />
                <Route path="/student/points" element={
                  <StudentAuthProvider><StudentLayout><StudentPoints /></StudentLayout></StudentAuthProvider>
                } />
                <Route path="/student/schedule" element={
                  <StudentAuthProvider><StudentLayout><StudentSchedule /></StudentLayout></StudentAuthProvider>
                } />
                <Route path="/student/feedback" element={
                  <StudentAuthProvider><StudentLayout><StudentFeedback /></StudentLayout></StudentAuthProvider>
                } />

                {/* Admin App Routes */}
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/students" element={<StudentsPage />} />
                <Route path="/classes" element={<ClassesPage />} />
                <Route path="/lessons" element={<LessonsPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                
                <Route path="/admin/users" element={<UserManagementPage />} />
                <Route path="/timetable" element={<TimetablePage />} />
                <Route path="/assistant-requests" element={<AssistantRequestsPage />} />
                <Route path="/assistant" element={<AssistantPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/admin/briefing" element={<AdminBriefingPage />} />
                <Route path="/admin/report" element={<AdminReportPage />} />
                <Route path="/admin/daily" element={<AdminDailyOpsPage />} />
                <Route path="/reports/status" element={<ReportStatusPage />} />
                <Route path="/vocab-test" element={<VocabTestPage />} />
                <Route path="/exam-archive" element={<SchoolExamArchivePage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthProvider>
          } />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
