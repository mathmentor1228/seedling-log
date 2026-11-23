import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminOfficeBoard } from '@/components/admin/AdminOfficeBoard';
import { TuitionLedgerProvider } from '@/components/tuition/TuitionLedgerContext';

export default function AdminOfficePage() {
  return (
    <ProtectedRoute allowedRoles={['admin']} allowedEmails={['bfkor8810@naver.com']}>
      {/* Provides the student payment-detail dialog for '원비 수납' task links. */}
      <TuitionLedgerProvider><AdminOfficeBoard /></TuitionLedgerProvider>
    </ProtectedRoute>
  );
}
