// HW-STATUS-UNIFY-V1 트리거 검증 — PGlite 임시 Postgres. 운영 DB 접속 없음.
// 실행: PGLITE_MODULE=<pglite 경로> node scripts/test-homework-sync.mjs
import fs from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const sql = fs.readFileSync(new URL('../supabase/migrations/20261009090000_sync_homework_check_from_lesson.sql', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✅ ' : '❌ ') + m); };

await db.exec(`
  CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE TYPE subject_type AS ENUM ('수학','과학','영어','국어');
  CREATE TYPE app_role AS ENUM ('admin','teacher','assistant');
  CREATE FUNCTION public.has_role(_u uuid, _r app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE TABLE lesson_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid, subject subject_type, lesson_date date,
    homework_status text NOT NULL DEFAULT 'none_assigned', teacher_id uuid, submitted boolean DEFAULT true, created_at timestamptz DEFAULT now());
  CREATE TABLE homework_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid, subject subject_type, assigned_date date,
    lesson_record_id uuid, check_status text NOT NULL DEFAULT 'unchecked', result text, checked_by uuid, checked_at timestamptz, notes text, content text);
`);
await db.exec(sql);
const S = '11111111-1111-1111-1111-111111111111', T = '22222222-2222-2222-2222-222222222222';
const hw = async (date, extra = '') => (await db.query(`INSERT INTO homework_assignments(student_id,subject,assigned_date,content ${extra ? ',' + extra.split('=')[0] : ''}) VALUES ('${S}','수학','${date}','x' ${extra ? ',' + extra.split('=')[1] : ''}) RETURNING id`)).rows[0].id;
const st = async (id) => (await db.query(`SELECT check_status, result, notes, checked_by FROM homework_assignments WHERE id='${id}'`)).rows[0];

// 케이스1: 9/29, 10/01 두 묶음(10/01 두 건). 10/02 일지 '완료' → 10/01 묶음만 확인, 9/29는 그대로
const a = await hw('2026-09-29'), b1 = await hw('2026-10-01'), b2 = await hw('2026-10-01');
await db.query(`INSERT INTO lesson_records(student_id,subject,lesson_date,homework_status,teacher_id) VALUES ('${S}','수학','2026-10-02','completed','${T}')`);
ok((await st(b1)).check_status === 'checked' && (await st(b1)).result === 'completed', '직전 묶음 1건 → checked/completed');
ok((await st(b2)).check_status === 'checked', '직전 묶음 같은 날 2건째도 checked');
ok((await st(a)).check_status === 'unchecked', '더 오래된 묶음(9/29)은 손대지 않음');
ok((await st(b1)).checked_by === T && (await st(b1)).notes.includes('자동 반영'), 'checked_by=일지 교사, notes 자동 표식');

// 케이스2: 이미 확인된 행은 보존 (result 유지)
const c = await hw('2026-10-03');
await db.query(`UPDATE homework_assignments SET check_status='checked', result='not_done', notes='교사메모' WHERE id='${c}'`);
await db.query(`INSERT INTO lesson_records(student_id,subject,lesson_date,homework_status,teacher_id) VALUES ('${S}','수학','2026-10-05','completed','${T}')`);
ok((await st(c)).result === 'not_done' && (await st(c)).notes === '교사메모', '이미 확인된 숙제는 덮어쓰지 않음');

// 케이스3: none_assigned 로 저장 → 아무것도 안 함; 이후 UPDATE 로 partial 되면 발동
const d = await hw('2026-10-06');
const lr = (await db.query(`INSERT INTO lesson_records(student_id,subject,lesson_date,homework_status,teacher_id) VALUES ('${S}','수학','2026-10-07','none_assigned','${T}') RETURNING id`)).rows[0].id;
ok((await st(d)).check_status === 'unchecked', 'none_assigned 저장은 영향 없음');
await db.query(`UPDATE lesson_records SET homework_status='partial' WHERE id='${lr}'`);
ok((await st(d)).result === 'partial', '같은 일지를 partial 로 갱신하면 발동');

// 케이스4: 오늘 일지에서 새로 낸 숙제(lesson_record_id = 이 일지)는 대상 아님
const lr2 = (await db.query(`INSERT INTO lesson_records(student_id,subject,lesson_date,homework_status,teacher_id) VALUES ('${S}','수학','2026-10-08','none_assigned','${T}') RETURNING id`)).rows[0].id;
const e = await hw('2026-10-08', `lesson_record_id='${lr2}'`);
await db.query(`UPDATE lesson_records SET homework_status='completed' WHERE id='${lr2}'`);
ok((await st(e)).check_status === 'unchecked', '같은 일지에서 낸 오늘 숙제는 확인 처리 안 함');
ok((await st(d)).result === 'partial', '10/06 숙제는 10/07 일지 결과(partial) 그대로 — 10/08 일지가 덮어쓰지 않음');

// 케이스5: 다른 과목은 영향 없음
const f = await hw('2026-10-07');
await db.query(`UPDATE homework_assignments SET subject='영어' WHERE id='${f}'`);
await db.query(`INSERT INTO lesson_records(student_id,subject,lesson_date,homework_status,teacher_id) VALUES ('${S}','수학','2026-10-09','completed','${T}')`);
ok((await st(f)).check_status === 'unchecked', '다른 과목 숙제는 손대지 않음');

// 케이스6: 21일보다 오래된 숙제는 무시
const g = await hw('2026-08-01');
await db.query(`DELETE FROM homework_assignments WHERE assigned_date >= '2026-09-01' AND check_status='unchecked'`);
await db.query(`INSERT INTO lesson_records(student_id,subject,lesson_date,homework_status,teacher_id) VALUES ('${S}','수학','2026-10-10','completed','${T}')`);
ok((await st(g)).check_status === 'unchecked', '21일 넘은 숙제는 무시');

// 케이스7: 백필 — 트리거 없이 쌓인 과거 데이터에 멱등 적용
await db.exec(`ALTER TABLE lesson_records DISABLE TRIGGER trg_sync_homework_check_from_lesson`);
const S2 = '33333333-3333-3333-3333-333333333333';
const h1 = (await db.query(`INSERT INTO homework_assignments(student_id,subject,assigned_date,content) VALUES ('${S2}','국어','2026-09-10','x') RETURNING id`)).rows[0].id;
await db.query(`INSERT INTO lesson_records(student_id,subject,lesson_date,homework_status,teacher_id) VALUES ('${S2}','국어','2026-09-12','completed','${T}')`);
await db.exec(`ALTER TABLE lesson_records ENABLE TRIGGER trg_sync_homework_check_from_lesson`);
ok((await st(h1)).check_status === 'unchecked', '백필 전: 과거 데이터는 미확인 상태');
const r1 = (await db.query(`SELECT * FROM backfill_homework_check_from_lessons('2026-08-15')`)).rows[0];
ok((await st(h1)).check_status === 'checked' && r1.homework_checked >= 1, `백필 1회: 일지 ${r1.lessons_scanned}건 스캔, 숙제 ${r1.homework_checked}건 확인`);
const r2 = (await db.query(`SELECT * FROM backfill_homework_check_from_lessons('2026-08-15')`)).rows[0];
ok(r2.homework_checked === 0, '백필 2회: 추가 변경 0건 (멱등)');

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
