# 상담 접수 → 찰떡이 Telegram

신규 상담이 consultation_leads에 저장된 뒤 consultation-intake가 개인 Telegram으로 알린다. 응답은 먼저 반환하며 EdgeRuntime.waitUntil로 알림을 이어간다. 기존 관리자 업무함 알림은 유지한다. get/update-intake에서는 발송하지 않는다.

## 배포
- Edge Function secrets: CONSULTATION_TELEGRAM_BOT_TOKEN, CONSULTATION_TELEGRAM_CHAT_ID.
- 봇은 기존 찰떡이, chat ID는 원장 개인 대화의 양수 숫자 ID. 그룹 ID는 거부한다.
- 토큰·chat ID를 Git, 문서, 프런트 코드, Lovable 채팅 본문에 넣지 않는다. 서버 Secrets 입력창에서만 등록한다.
- consultation-intake 함수만 재배포. DB 마이그레이션·프런트 Publish 불필요.

## 검증
`node --test supabase/functions/consultation-intake/tests/telegram.test.ts`
신규 예약 테스트 후 성공 응답, 관리자 업무, 개인 Telegram 도착을 각각 확인한다. 테스트 예약은 명확히 테스트로 표시하고 실제 학생 정보를 쓰지 않는다.

## 동작 범위
알림: 희망 일정, 학년, 과목, 접수번호, 인증이 필요한 관리자 화면 링크. 학생·보호자 이름, 전화번호, 상담 고민, 사전정보 public_token은 전송하지 않는다.
요청당 5초 제한, 최대 3회. 일시적 5xx·네트워크 실패·짧은 429를 재시도한다. 401/403 같은 영구 오류나 긴 rate limit은 실패로 기록한다. 예외 원문/요청 URL은 토큰 노출 방지를 위해 기록하지 않는다.
장기 장애 시 자동 재발송 큐는 없으며 기존 관리자 업무함이 남는다. Telegram이 받았지만 응답이 유실된 경우 재시도로 같은 접수번호 알림이 중복될 수 있다(정확히 한 번 전송 보장 아님). 기존 접수를 소급해서 알리지 않는다.
