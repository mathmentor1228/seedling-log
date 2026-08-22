// COMPAT-REDIRECT-V1
// 통합된 이전 URL을 대표 URL로 보내되 query string / hash 는 그대로 보존한다.
// (기존 북마크·직접 URL·뒤로가기 안전. 라우트는 삭제하지 않는다.)
import { Navigate, useLocation } from 'react-router-dom';

export function CompatRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}
