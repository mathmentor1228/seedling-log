---
name: attendance_status standard values
description: lesson_records.attendance_status 배열에 허용되는 표준 6종 값
type: constraint
---
lesson_records.attendance_status 배열의 표준값 6종 (LessonRecordForm ATTENDANCE_STATUS_OPTIONS 기준):
- 정상등원, 지각, 조퇴, 인정결석, 무단결석, 보충불가

금지: '출석'(→ 정상등원), '미등원'(→ 무단결석). 새 입력 화면 작성 시 반드시 표준값만 사용. Dashboard 정렬/필터는 '정상등원' 기준.
