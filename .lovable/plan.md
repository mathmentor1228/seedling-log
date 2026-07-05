# 특강 추가 · 투트랙 공동지도 확장안

수업 설계(plan_designs)에 두 가지 확장을 얹습니다. 기존 설계는 그대로 두고, "확장(Extension)" 레이어를 새로 추가하는 방식이라 원래 커리큘럼이 오염되지 않습니다.

---

## 1. 특강 추가 (Intensive Add-on)

**개념**: 이미 굴러가는 설계에 "방학특강 8회"처럼 **기간 한정 추가 시수**를 얹으면, 해당 기간 동안 진도 세션 수가 늘어나고 커리큘럼(목표 배분)이 자동으로 다시 계산됩니다.

**흐름**
1. 설계 카드에서 `+ 특강 추가` 클릭
2. 모달에서 입력:
   - 라벨 (예: "여름방학 특강")
   - 시작일 · 종료일
   - 추가 시수 (예: 8회)
   - 추가 요일/시간 리듬 (기존과 다르게: 예 "월·수·금 오전")
   - 대상: 그룹 전체 또는 특정 학생만
3. 저장 시 해당 기간의 세션이 기존 리듬 위에 합쳐지고, `countProgressSessions`가 특강 세션까지 포함해 재계산 → 목표 배분 자동 갱신
4. 특강 종료일 이후에는 원래 리듬으로 복귀

**표기**: 세션 목록에서 특강 세션은 배지(`특강`)로 구분

---

## 2. 투트랙 공동지도 (Co-Teacher Assignment)

**개념**: 한 설계를 두 선생님이 함께 운영. 합류 선생님은 **기간 한정**으로 참여하며, 그 기간 내 세션별로 어떤 개념을 어느 선생님이 맡을지 지정.

**흐름**
1. 설계 카드에서 `+ 공동 선생님` 클릭
2. 모달에서:
   - 합류 선생님 선택
   - 참여 기간 (시작일~종료일)
   - 역할 메모 (예: "심화 개념 담당")
3. 저장 후, 해당 기간 세션 목록에서 각 세션별로 담당 선생님 드롭다운이 활성화 → 세션별 담당자 지정
4. 담당자 미지정 세션은 기본 담당(원래 teacher_id)로 표시

**표기**: 세션 카드에 담당 선생님 이름 뱃지, 공동지도 기간에는 두 선생님 아바타 모두 노출

---

## 데이터 모델

신규 `plan_*` 테이블 3개 (기존 스키마 원칙 유지, 교직원 전체 접근):

```text
plan_intensives            여름/겨울/시험대비 등 특강 정의
 ├ design_id (FK)
 ├ label, start_date, end_date
 ├ added_sessions (int)     추가 시수
 ├ rhythm (jsonb)           특강 요일-시간 리듬
 └ scope ('all' | 'subset')

plan_intensive_students    특강 대상이 서브셋일 때 학생 매핑
 ├ intensive_id (FK)
 └ student_id

plan_co_teachers           공동지도 참여 등록
 ├ design_id (FK)
 ├ teacher_id
 ├ start_date, end_date
 ├ role_note
 └ status ('active' | 'ended')
```

`plan_sessions`에 컬럼 두 개 추가:
- `intensive_id uuid NULL` — 특강 세션 표시
- `assigned_teacher_id uuid NULL` — 세션별 담당자 오버라이드

모두 `Staff full access` RLS + service_role GRANT.

---

## UI 변경 지점

- `src/pages/PlanPage.tsx` — 설계 카드에 `특강 추가` · `공동 선생님` 버튼
- `src/components/plan/IntensiveModal.tsx` (신규) — 특강 추가 폼
- `src/components/plan/CoTeacherModal.tsx` (신규) — 공동지도 참여 폼
- `src/components/plan/SessionAssignmentList.tsx` (신규) — 기간 내 세션별 담당자 지정 리스트
- `src/components/plan/planApi.ts` — `addIntensive`, `addCoTeacher`, `assignSessionTeacher`, `recomputeGoalDistribution` 헬퍼

`DesignWizard.tsx`는 건드리지 않고, 설계 완료 이후 "확장" 액션으로만 접근.

---

## 커리큘럼 재계산 규칙

특강이 추가되면:
1. 원래 리듬 세션 수 + 특강 세션 수 = 총 진도 슬롯
2. 남은 목표(plan_goals) 개수를 총 슬롯에 균등 배분
3. 이미 완료된 세션(`plan_goal_progress`에 기록된 것)은 건너뛰고 앞으로의 세션만 재분배

이 계산은 클라이언트 헬퍼로 순수 함수화(테스트 가능).

---

## 진행 순서
1. 마이그레이션 (테이블 3개 + plan_sessions 2컬럼)
2. planApi 헬퍼 추가
3. IntensiveModal / CoTeacherModal / SessionAssignmentList 구현
4. PlanPage 카드에 진입점 버튼
5. 세션 목록 화면에 특강/공동지도 배지 표기

승인해주시면 마이그레이션부터 진행하겠습니다.