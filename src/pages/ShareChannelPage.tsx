// SHARE-CHANNEL-V1: /share — 직원 자료·전달 채널 (원장·선생님·조교 공통)
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ShareChannel } from '@/components/share/ShareChannel';

export default function ShareChannelPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'teacher', 'assistant']}>
      <ShareChannel />
    </ProtectedRoute>
  );
}
