import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { StudentAuthProvider } from "@/lib/studentAuth";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));

const VocabTestViewPage = lazy(() => import("./pages/VocabTestViewPage"));
const QuizPrintPage = lazy(() => import("./pages/QuizPrintPage"));
const QuizSubmitPage = lazy(() => import("./pages/QuizSubmitPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const TrialSignup = lazy(() => import("./pages/TrialSignup"));
const PublicReport = lazy(() => import("./pages/PublicReport"));
const IntensiveApplyPage = lazy(() => import("./pages/IntensiveApplyPage"));
const IntensiveApplicationsPage = lazy(() => import("./pages/IntensiveApplicationsPage"));
const ParentPortal = lazy(() => import("./pages/ParentPortal"));
const PayInfo = lazy(() => import("./pages/PayInfo"));
const ParentNotifications = lazy(() => import("./pages/ParentNotifications"));
const ParentSurveyPage = lazy(() => import("./pages/ParentSurveyPage"));
const StudentLayout = lazy(() =>
  import("@/components/student/StudentLayout").then((m) => ({ default: m.StudentLayout }))
);

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const PrincipalDashboard = lazy(() => import("./pages/PrincipalDashboard"));
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard"));
const AssistantDashboardPage = lazy(() => import("./pages/AssistantDashboardPage"));
const ParentDashboardPage = lazy(() => import("./pages/ParentDashboardPage"));
const StudentsPage = lazy(() => import("./pages/StudentsPage"));
const StudentKartePage = lazy(() => import("./pages/StudentKartePage"));
const UnclosedLessonsPage = lazy(() => import("./pages/UnclosedLessonsPage"));
const DataQualityPage = lazy(() => import("./pages/DataQualityPage"));
const ClassesPage = lazy(() => import("./pages/ClassesPage"));
const LessonsPage = lazy(() => import("./pages/LessonsPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const UserManagementPage = lazy(() => import("./pages/UserManagementPage"));
const TimetablePage = lazy(() => import("./pages/TimetablePage"));
const AssistantRequestsPage = lazy(() => import("./pages/AssistantRequestsPage"));
const AssistantPage = lazy(() => import("./pages/AssistantPage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
const AttendanceBookPage = lazy(() => import("./pages/AttendanceBookPage"));
const AdminBriefingPage = lazy(() => import("./pages/AdminBriefingPage"));
const AdminReportPage = lazy(() => import("./pages/AdminReportPage"));
const AdminDailyOpsPage = lazy(() => import("./pages/AdminDailyOpsPage"));
const AdminOfficePage = lazy(() => import("./pages/AdminOfficePage"));
const ParentLearningFeedbackPage = lazy(() => import("./pages/ParentLearningFeedbackPage"));
const TuitionPage = lazy(() => import("./pages/TuitionPage"));
const IncomeManagementPage = lazy(() => import("./pages/IncomeManagementPage"));
const TextbookPage = lazy(() => import("./pages/TextbookPage"));
const ReportStatusPage = lazy(() => import("./pages/ReportStatusPage"));
const VocabTestPage = lazy(() => import("./pages/VocabTestPage"));
const VocabTestGeneratorPage = lazy(() => import("./pages/VocabTestGeneratorPage"));
const SchoolExamArchivePage = lazy(() => import("./pages/SchoolExamArchivePage"));
const ExamBoardPage = lazy(() => import("./pages/ExamBoardPage"));
const ExamDirectionPage = lazy(() => import("./pages/ExamDirectionPage"));
const PlanPage = lazy(() => import("./pages/PlanPage"));
const PlanTodayPage = lazy(() => import("./pages/PlanTodayPage"));
const PlanPlannerPage = lazy(() => import("./pages/PlanPlannerPage"));
const PlanOverviewPage = lazy(() => import("./pages/PlanOverviewPage"));
const MathConceptPage = lazy(() => import("./pages/MathConceptPage"));
const ExamPrepPage = lazy(() => import("./pages/ExamPrepPage"));
const StudySessionPage = lazy(() => import("./pages/StudySessionPage"));
const ExamReviewPage = lazy(() => import("./pages/ExamReviewPage"));
const ExamScoreTrendsPage = lazy(() => import("./pages/ExamScoreTrendsPage"));
const QuizBulkUploadPage = lazy(() => import("./pages/QuizBulkUploadPage"));
const QuizLookupPage = lazy(() => import("./pages/QuizLookupPage"));
const LessonRecordPage = lazy(() => import("./pages/LessonRecordPage"));
const BatchLessonEntryPage = lazy(() => import("./pages/BatchLessonEntryPage"));
const QuickLessonEntryPage = lazy(() => import("./pages/QuickLessonEntryPage"));
const LessonCloseoutPage = lazy(() => import("./pages/LessonCloseoutPage"));
const SubjectMaterialPage = lazy(() => import("./pages/SubjectMaterialPage"));
const PrivateChannelPage = lazy(() => import("./pages/PrivateChannelPage"));
const WorkLogsPage = lazy(() => import("./pages/WorkLogsPage"));
const StudentLogin = lazy(() => import("./pages/student/StudentLogin"));
const StudentDashboard = lazy(() => import("./pages/student/StudentDashboard"));
const StudentHomework = lazy(() => import("./pages/student/StudentHomework"));
const StudentPoints = lazy(() => import("./pages/student/StudentPoints"));
const StudentSchedule = lazy(() => import("./pages/student/StudentSchedule"));
const StudentFeedback = lazy(() => import("./pages/student/StudentFeedback"));
const StudentVocab = lazy(() => import("./pages/student/StudentVocab"));
const StudentMathQuiz = lazy(() => import("./pages/student/StudentMathQuiz"));
const StudentStudySession = lazy(() => import("./pages/student/StudentStudySession"));
const StudentExamReview = lazy(() => import("./pages/student/StudentExamReview"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteLoading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-7 w-7 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<RouteLoading />}>
        <Routes>
          {/* Public route - NO AuthProvider, accessible without login */}
          <Route path="/report/view" element={<PublicReport />} />
          <Route path="/summer-intensive" element={<IntensiveApplyPage />} />
          <Route path="/parent" element={<ParentPortal />} />
          <Route path="/parent/survey" element={<ParentSurveyPage />} />
          <Route path="/parent-notify" element={<ParentNotifications />} />
          <Route path="/pay-info" element={<PayInfo />} />
          <Route path="/trial" element={<TrialSignup />} />
          <Route path="/vocab-test-view" element={<VocabTestViewPage />} />
          <Route path="/quiz-print" element={<QuizPrintPage />} />
          <Route path="/quiz-submit" element={<QuizSubmitPage />} />

          {/* All authenticated routes */}
          <Route path="/*" element={
            <AuthProvider>
              <Suspense fallback={<RouteLoading />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/login" element={<Auth />} />
                  <Route path="/auth" element={<Navigate to="/login" replace />} />

                {/* Role-based dashboards */}
                <Route path="/principal" element={<PrincipalDashboard />} />
                <Route path="/teacher" element={<TeacherDashboard />} />
                <Route path="/assistant" element={<AssistantDashboardPage />} />
                <Route path="/parent-dashboard" element={<ParentDashboardPage />} />

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
                <Route path="/student/vocab" element={
                  <StudentAuthProvider><StudentLayout><StudentVocab /></StudentLayout></StudentAuthProvider>
                } />
                <Route path="/student/math-quiz" element={
                  <StudentAuthProvider><StudentLayout><StudentMathQuiz /></StudentLayout></StudentAuthProvider>
                } />
                <Route path="/student/exam-review" element={
                  <StudentAuthProvider><StudentLayout><StudentExamReview /></StudentLayout></StudentAuthProvider>
                } />
                <Route path="/student/study" element={
                  <StudentAuthProvider><StudentLayout><StudentStudySession /></StudentLayout></StudentAuthProvider>
                } />

                {/* Admin App Routes */}
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/students" element={<StudentsPage />} />
                <Route path="/students/:studentId/karte" element={<StudentKartePage />} />
                <Route path="/admin/unclosed" element={<UnclosedLessonsPage />} />
                <Route path="/admin/data-quality" element={<DataQualityPage />} />
                <Route path="/classes" element={<ClassesPage />} />
                <Route path="/lessons" element={<LessonsPage />} />
                <Route path="/lessons/batch" element={<BatchLessonEntryPage />} />
                <Route path="/lessons/quick" element={<QuickLessonEntryPage />} />
                <Route path="/lessons/close" element={<LessonCloseoutPage />} />
                <Route path="/lessons/record/new" element={<LessonRecordPage />} />
                <Route path="/lessons/record/:recordId" element={<LessonRecordPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                
                <Route path="/admin/users" element={<UserManagementPage />} />
                <Route path="/timetable" element={<TimetablePage />} />
                <Route path="/assistant-requests" element={<AssistantRequestsPage />} />
                <Route path="/assistant-tasks" element={<AssistantPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/admin/attendance-book" element={<AttendanceBookPage />} />
                <Route path="/admin/briefing" element={<AdminBriefingPage />} />
                <Route path="/admin/report" element={<AdminReportPage />} />
                <Route path="/admin/daily" element={<AdminDailyOpsPage />} />
                <Route path="/admin/office" element={<AdminOfficePage />} />
                <Route path="/admin/parent-learning-feedback" element={<ParentLearningFeedbackPage />} />
                <Route path="/admin/tuition" element={<TuitionPage />} />
                <Route path="/admin/income" element={<IncomeManagementPage />} />
                <Route path="/textbooks" element={<TextbookPage />} />
                <Route path="/reports/status" element={<ReportStatusPage />} />
                <Route path="/vocab-test" element={<VocabTestPage />} />
                <Route path="/plan" element={<PlanPage />} />
                <Route path="/plan/overview" element={<PlanOverviewPage />} />
                <Route path="/plan/:designId/today" element={<PlanTodayPage />} />
                <Route path="/plan/:designId/planner" element={<PlanPlannerPage />} />
                <Route path="/exam-board" element={<ExamBoardPage />} />
                <Route path="/exam-board/principal" element={<ExamDirectionPage />} />
                <Route path="/admin/intensive-applications" element={<IntensiveApplicationsPage />} />
                <Route path="/exam-archive" element={<SchoolExamArchivePage />} />
                <Route path="/exam-review" element={<ExamReviewPage />} />
                <Route path="/exam-trends" element={<ExamScoreTrendsPage />} />
                <Route path="/vocab-generator" element={<VocabTestGeneratorPage />} />
                <Route path="/materials/:subject" element={<SubjectMaterialPage />} />
                <Route path="/math-concepts" element={<MathConceptPage />} />
                <Route path="/quiz-bulk-upload" element={<QuizBulkUploadPage />} />
                <Route path="/quiz-lookup" element={<QuizLookupPage />} />
                <Route path="/exam-prep" element={<ExamPrepPage />} />
                <Route path="/study-sessions" element={<StudySessionPage />} />
                <Route path="/private-channel" element={<PrivateChannelPage />} />
                <Route path="/work-logs" element={<WorkLogsPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </AuthProvider>
          } />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
