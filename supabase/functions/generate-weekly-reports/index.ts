import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// WEEKLY-REPORT-SAFETY-V1
import {
  scanSafety,
  neutralParentTemplate,
  neutralStudentTemplate,
  CONTENT_SAFETY_RULES,
} from './safety.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// v2.4-sendable-lock: Final narrative enforcement with quality tagging
// REPORT-ENGINE-DEBUG-V2
// REPORT-ERROR-DETAIL-V1: Enhanced error tracking with stage, code, and debug info
const SCHEDULE_CONFIG = {
  schedule_text: 'Sat 22:00 KST',
  cron_utc: '0 13 * * 6',
};

const TEMPLATE_VERSION = 'v2.4-sendable-lock';

// v2.4: hard marker so we can verify the narrative saver is the one writing the row
const NARRATIVE_RENDER_PREFIX = '[NARRATIVE_RENDER_ACTIVE v2.4]';

// REPORT-ERROR-DETAIL-V1: Error detail structure
interface ErrorDetail {
  student_id: string;
  student_name: string;
  error_stage: 'fetch_records' | 'build_prompt' | 'llm_call' | 'validate' | 'save_report' | 'unknown';
  error_message: string;
  error_code?: string;
  fetched_lesson_records_count: number;
  submitted_count: number;
  draft_count: number;
}

// v2.4 FINAL SAVE VALIDATOR - stricter forbidden patterns
const FORBIDDEN_PATTERNS_V24 = {
  bracketHeaders: /【/,
  bulletDot: /·/,
  newlineDash: /\n-\s/,
  newlineBullet: /\n•/,
  labelLearningPoints: /학습\s*포인트\s*[:：]/i,
  labelNextPlan: /다음\s*주\s*계획\s*[:：]/i,
  startsWithGeneral: /^전반적으로/,
};

function validateFinalSaveText(text: string): { pass: boolean; violations: string[] } {
  const violations: string[] = [];
  
  if (FORBIDDEN_PATTERNS_V24.bracketHeaders.test(text)) {
    violations.push('BRACKET_HEADER');
  }
  if (FORBIDDEN_PATTERNS_V24.bulletDot.test(text)) {
    violations.push('BULLET_DOT');
  }
  if (FORBIDDEN_PATTERNS_V24.newlineDash.test(text)) {
    violations.push('NEWLINE_DASH');
  }
  if (FORBIDDEN_PATTERNS_V24.newlineBullet.test(text)) {
    violations.push('NEWLINE_BULLET');
  }
  if (FORBIDDEN_PATTERNS_V24.labelLearningPoints.test(text)) {
    violations.push('LABEL_LEARNING_POINTS');
  }
  if (FORBIDDEN_PATTERNS_V24.labelNextPlan.test(text)) {
    violations.push('LABEL_NEXT_PLAN');
  }
  if (FORBIDDEN_PATTERNS_V24.startsWithGeneral.test(text.trim())) {
    violations.push('STARTS_WITH_GENERAL');
  }
  
  return {
    pass: violations.length === 0,
    violations,
  };
}

function stripInternalDebugBlocks(text: string): string {
  const parts = text
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .filter((p) => !p.startsWith('[REPORT_ENGINE_DEBUG]'))
    .filter((p) => !p.startsWith('[REPORT_GEN_DEBUG'));

  return parts.join('\n\n').trim();
}

function formatParentHeader(studentName: string, weekStart: string, weekEnd: string): string {
  const startDate = new Date(weekStart);
  const endDate = new Date(weekEnd);
  const startMonth = startDate.getMonth() + 1;
  const startDay = startDate.getDate();
  const endMonth = endDate.getMonth() + 1;
  const endDay = endDate.getDate();

  return `[더멘토] ${studentName} 주간 학습 리포트 (${startMonth}/${startDay}~${endMonth}/${endDay})`;
}

// Determine quality tag based on validation and content
function determineQualityTag(
  validatorPass: boolean,
  subjectCount: number,
  lessonCount: number,
  aiAdminTag?: string
): 'GREEN' | 'YELLOW' | 'RED' {
  // If validator failed, mark RED
  if (!validatorPass) {
    return 'RED';
  }
  
  // If AI explicitly marked RED, respect it
  if (aiAdminTag === 'RED') {
    return 'RED';
  }
  
  // GREEN: passes validator and has >=2 subjects with narrative
  if (subjectCount >= 2 && lessonCount >= 2) {
    return aiAdminTag === 'YELLOW' ? 'YELLOW' : 'GREEN';
  }
  
  // YELLOW: passes validator but limited data
  return 'YELLOW';
}

const RED_PARENT_PLACEHOLDER = '이번 주 학습 내용을 충분히 설명하기 위해 교사 추가 코멘트가 필요합니다.';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let isManual = false;
  let includeDebug = false;
  let studentIds: string[] | null = null;
  let customWeekStart: string | null = null;
  let customWeekEnd: string | null = null;
  let useDirectSave = false;
  // WEEKLY-REPORT-REPAIR-V1
  let dryRun = false;
  let force = false;
  let targetWeek: 'last' | 'current' = 'last';
  let targetWeekDate: string | null = null;
  // WEEKLY-REPORT-BATCH-V1: 작은 배치·재개 지원 (1~20, 기본 20)
  let batchSize = 20;
  const AI_CALL_TIMEOUT_MS = 45_000;


  // WEEKLY-REPORT-SAFEPATH-V2: legacy RPC 자동 선택 차단
  let legacyAllowed = false;

  try {
    const body = await req.json().catch(() => ({}));
    isManual = body.manual === true;
    includeDebug = body.include_debug === true;
    studentIds = body.student_ids || null;
    customWeekStart = body.week_start || null;
    customWeekEnd = body.week_end || null;
    useDirectSave = body.direct_save === true;
    dryRun = body.dry_run === true;
    force = body.force === true;
    if (body.target_week === 'current') targetWeek = 'current';
    else if (typeof body.target_week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.target_week)) {
      targetWeekDate = body.target_week;
    }
    // WEEKLY-REPORT-BATCH-V1: batch_size는 1~20만 허용, 그 외/미지정은 20
    if (body.batch_size !== undefined) {
      const n = Number(body.batch_size);
      batchSize = Number.isFinite(n) ? Math.min(20, Math.max(1, Math.floor(n))) : 20;
    }
    // WEEKLY-REPORT-SAFEPATH-V2: 새 API 파라미터(target_week/dry_run/force/batch_size)가 하나라도
    // 명시되면 legacy_rpc 경로를 절대 선택하지 않고 안전 per-student 경로만 사용한다.
    const usesNewApi =
      body.target_week !== undefined ||
      body.dry_run !== undefined ||
      body.force !== undefined ||
      body.batch_size !== undefined;
    if (usesNewApi || dryRun) useDirectSave = true;

    // legacy RPC는 명시적 mode='legacy_rpc' + 관리자 확인 플래그가 모두 있고,
    // 새 API 파라미터가 전혀 없을 때만 허용한다.
    legacyAllowed =
      !usesNewApi &&
      body.mode === 'legacy_rpc' &&
      body.confirm_legacy_rpc === true;

  } catch {
    // Ignore JSON parse errors
  }

  // 기본(파라미터 없는 스케줄/수동 호출)도 안전 경로로 강제
  if (!legacyAllowed) useDirectSave = true;




  const scope = studentIds && studentIds.length > 0 ? 'selected' : 'all';
  const schedulerSource = isManual ? 'manual' : 'pg_cron';
  console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG_V2.4: Starting ${schedulerSource} weekly report generation`);
  console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG_V2.4: source=edge_function, scope=${scope}, count=${studentIds?.length || 'all'}, direct_save=${useDirectSave}`);
  console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG_V2.4: file=supabase/functions/generate-weekly-reports/index.ts templateVersion=${TEMPLATE_VERSION}`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate week dates
    let weekStart: string;
    let weekEnd: string;
    
    if (customWeekStart && customWeekEnd) {
      weekStart = customWeekStart;
      weekEnd = customWeekEnd;
    } else if (targetWeekDate) {
      // WEEKLY-REPORT-REPAIR-V1: target_week='YYYY-MM-DD'(KST 월요일) → 월~토
      const base = new Date(`${targetWeekDate}T00:00:00Z`);
      const sat = new Date(base);
      sat.setUTCDate(sat.getUTCDate() + 5);
      weekStart = base.toISOString().split('T')[0];
      weekEnd = sat.toISOString().split('T')[0];
    } else {

      const now = new Date();
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstNow = new Date(now.getTime() + kstOffset);
      
      const dayOfWeek = kstNow.getUTCDay();
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const mondayDate = new Date(kstNow);
      mondayDate.setUTCDate(mondayDate.getUTCDate() - daysFromMonday);
      mondayDate.setUTCHours(0, 0, 0, 0);
      // WEEKLY-REPORT-REPAIR-V1: 기본은 '지난 주'(월~토). 월요일 새벽 스케줄 실행 기준.
      if (targetWeek === 'last') {
        mondayDate.setUTCDate(mondayDate.getUTCDate() - 7);
      }
      
      const saturdayDate = new Date(mondayDate);
      saturdayDate.setUTCDate(saturdayDate.getUTCDate() + 5);
      
      weekStart = mondayDate.toISOString().split('T')[0];
      weekEnd = saturdayDate.toISOString().split('T')[0];

    }

    const studentCount = studentIds?.length || 'all';
    console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG_V2.4: Generating for week: ${weekStart} to ${weekEnd}, scope=${scope}, count=${studentCount}, direct_save=${useDirectSave}`);

    let templateVersion = TEMPLATE_VERSION;
    if (!useDirectSave) {
      try {
        const { data: templates } = await supabase
          .from('report_templates')
          .select('version')
          .eq('template_name', 'parent')
          .eq('is_active', true)
          .limit(1);
        if (templates?.[0]?.version) {
          templateVersion = templates[0].version;
        }
        console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG_V2.4: DB templateVersion=${templateVersion}`);
      } catch (e) {
        console.error(`[generate-weekly-reports] REPORT_GEN_DEBUG_V2.4: Failed to load template version`, e);
      }
    }

    // ============================================================
    // DIRECT SAVE MODE: v2.4-sendable-lock with final validation
    // ============================================================
    if (useDirectSave) {
      console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG_V2.4: Using DIRECT SAVE mode with final validator`);
      
      let studentsToGenerate: { id: string; name: string }[] = [];
      
      if (studentIds && studentIds.length > 0) {
        const { data: students, error: stuErr } = await supabase
          .from('students')
          .select('id, name')
          .in('id', studentIds);
        if (stuErr) throw new Error(`STUDENT_FETCH_ERROR: ${stuErr.message}`);
        studentsToGenerate = students || [];
      } else {
        // WEEKLY-REPORT-REPAIR-V1: 활성 학생 기준을 관리자 화면과 동일하게 맞춘다.
        const { data: students, error: stuErr } = await supabase
          .from('students')
          .select('id, name')
          .in('enrollment_status', ['재학', '재등원']);
        if (stuErr) throw new Error(`STUDENT_FETCH_ERROR: ${stuErr.message}`);
        studentsToGenerate = students || [];
      }

      // WEEKLY-REPORT-REPAIR-V1: idempotency + 공개본 보호
      const { data: existingRows } = await supabase
        .from('weekly_reports')
        .select('id, student_id, parent_visible, parent_sent_at, report_quality_tag')
        .eq('week_start', weekStart)
        .in('student_id', studentsToGenerate.map((s) => s.id));
      const existingMap = new Map<string, any>((existingRows || []).map((r: any) => [r.student_id, r]));

      const isProtected = (r: any) => !!r && (r.parent_visible === true || !!r.parent_sent_at);

      let skippedExisting = 0;
      let skippedProtected = 0;
      const targets = studentsToGenerate.filter((s) => {
        const r = existingMap.get(s.id);
        if (!r) return true;
        if (isProtected(r)) { skippedProtected++; return false; } // 공개/발송본은 force여도 보호
        if (!force) { skippedExisting++; return false; }
        return true;
      });

      // WEEKLY-REPORT-BATCH-V1: 안정적인 정렬(id 오름차순) 후 batch_size만큼만 처리 → 재호출로 재개
      targets.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const batchTargets = targets.slice(0, batchSize);
      const remainingCount = Math.max(0, targets.length - batchTargets.length);

      if (dryRun) {
        return new Response(
          JSON.stringify({
            status: 'dry_run',
            success: true,
            execution_mode: 'safe_per_student',
            weekStart,
            weekEnd,
            dryRun: true,
            candidateCount: studentsToGenerate.length,
            activeCount: studentsToGenerate.length,
            pendingCount: targets.length,
            wouldGenerate: batchTargets.length,
            wouldProcess: batchTargets.length,
            processed_this_batch: 0,
            created: 0,
            skipped: skippedExisting + skippedProtected,
            errors: 0,
            batch_size: batchSize,
            remaining_count: remainingCount,
            next_batch_needed: remainingCount > 0,
            skippedExisting,
            skippedProtected,
            force,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }


      studentsToGenerate = batchTargets;
      console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG_V2.4: Processing ${studentsToGenerate.length}/${targets.length} students (batchSize=${batchSize} skipExisting=${skippedExisting} protected=${skippedProtected})`);



      let successCount = 0;
      let errorCount = 0;
      let validationFallbackCount = 0;
      const errors: string[] = [];
      const errorDetails: ErrorDetail[] = [];


      for (const student of studentsToGenerate) {
        // REPORT-ERROR-DETAIL-V1: Track state for error reporting
        let currentStage: ErrorDetail['error_stage'] = 'unknown';
        let debugTotal = 0;
        let debugSubmitted = 0;
        let debugDraft = 0;
        let safetyFallback = false;
        let safetyViolations: string[] = [];

        try {
          console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG_V2.4: Generating for ${student.name} (${student.id})`);
          currentStage = 'fetch_records';

          // Invoke AI report generator
          // WEEKLY-REPORT-BATCH-V1: 학생별 AI 호출 타임아웃 → 함수 전체 타임아웃 방지
          const invokeAiReport = async (strictNarrative: boolean) => {
            currentStage = 'llm_call';
            const call = supabase.functions.invoke('generate-ai-report', {
              body: {
                student_id: student.id,
                student_name: student.name,
                week_start: weekStart,
                week_end: weekEnd,
                strict_narrative: strictNarrative,
                // WEEKLY-REPORT-SAFETY-V1: 생성 단계 문안 규칙 강화
                content_safety_rules: CONTENT_SAFETY_RULES,
                forbid_counts: true,
                forbid_future_promises: true,
                observation_only: true,
              },
            });
            let timer: number | undefined;
            const timeout = new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('AI_CALL_TIMEOUT')),
                AI_CALL_TIMEOUT_MS
              ) as unknown as number;
            });
            try {
              return await Promise.race([call, timeout]);
            } finally {
              if (timer !== undefined) clearTimeout(timer);
            }
          };


          let aiReportData: any = null;
          let aiAttempts = 0;
          let validatorStatus: 'pass' | 'fail' = 'pass';
          let validatorReason: string | null = null;
          let validatorViolations: string[] = [];

          // Try once, then retry once with stricter system message
          for (const strict of [false, true]) {
            aiAttempts++;
            const { data, error } = await invokeAiReport(strict);

            if (error || !data) {
              validatorReason = error?.message || 'AI_CALL_FAILED';
              console.error(`[generate-weekly-reports] AI report error (strict=${strict}) for ${student.name}:`, error);
              continue;
            }

            const rawParent = typeof data.parent_message === 'string' ? data.parent_message : '';
            const cleanedParent = rawParent ? stripInternalDebugBlocks(rawParent) : '';

            if (!cleanedParent) {
              validatorReason = 'NO_PARENT_MESSAGE';
              continue;
            }

            // v2.4 FINAL SAVE VALIDATOR
            currentStage = 'validate';
            const validation = validateFinalSaveText(cleanedParent);
            
            if (!validation.pass) {
              validatorStatus = 'fail';
              validatorViolations = validation.violations;
              validatorReason = validation.violations.join(',');
              console.warn(`[generate-weekly-reports] REPORT_GEN_DEBUG_V2.4: Validator FAIL (strict=${strict}) for ${student.name}: ${validatorReason}`);
              
              // On first attempt failure, retry with strict mode
              if (!strict) {
                continue;
              }
            }

            // Accept this AI result
            aiReportData = {
              ...data,
              parent_message: cleanedParent,
            };
            
            if (validation.pass) {
              validatorStatus = 'pass';
              validatorViolations = [];
              validatorReason = null;
            }
            
            break;
          }

          let finalParentMessageToSave: string | null = null;
          let finalStudentMessageToSave: string | null = null;
          let draftStatusToSave: string = 'generated';
          let riskLevelFromAi: string | null = 'high';
          let qualityTag: 'GREEN' | 'YELLOW' | 'RED' = 'RED';

          // Get lesson count and subjects with debug info
          // First get ALL lessons for debug
          currentStage = 'fetch_records';
          const { data: allLessonsDebug, error: fetchError } = await supabase
            .from('lesson_records')
            .select('id, subject, submitted, submitted_at')
            .eq('student_id', student.id)
            .gte('lesson_date', weekStart)
            .lte('lesson_date', weekEnd);

          if (fetchError) {
            throw new Error(`FETCH_ERROR: ${fetchError.message}`);
          }

          debugTotal = allLessonsDebug?.length || 0;
          debugSubmitted = allLessonsDebug?.filter(l => l.submitted === true)?.length || 0;
          debugDraft = allLessonsDebug?.filter(l => l.submitted === false || l.submitted === null)?.length || 0;
          const debugSubjects: Record<string, number> = {};
          allLessonsDebug?.forEach(l => {
            debugSubjects[l.subject] = (debugSubjects[l.subject] || 0) + 1;
          });

          console.log(`[DATA_DEBUG] ${student.name}: fetched=${debugTotal} submitted=${debugSubmitted} draft=${debugDraft} subjects=${JSON.stringify(debugSubjects)}`);

          // Now get the actual submitted lessons
          const { data: lessons } = await supabase
            .from('lesson_records')
            .select('id, subject, understanding_score, homework_status')
            .eq('student_id', student.id)
            .gte('lesson_date', weekStart)
            .lte('lesson_date', weekEnd)
            .eq('submitted', true);

          const lessonCount = lessons?.length || 0;
          const subjectCount = new Set(lessons?.map(l => l.subject) || []).size;

          if (!aiReportData || validatorStatus === 'fail') {
            // Retry exhausted or validator failed -> mark RED + store placeholder
            validatorStatus = 'fail';
            riskLevelFromAi = 'high';
            draftStatusToSave = 'needs_input';
            qualityTag = 'RED';
            
            const header = formatParentHeader(student.name, weekStart, weekEnd);
            const debugLine = `[REPORT_GEN_DEBUG_V2.4] templateVersion=${TEMPLATE_VERSION} tag=RED validator=fail retries=${aiAttempts}`;
            
            finalParentMessageToSave = `${NARRATIVE_RENDER_PREFIX}\n\n${header}\n\n${debugLine}\n\n${RED_PARENT_PLACEHOLDER}`;
            finalStudentMessageToSave = null;
          } else {
            riskLevelFromAi = aiReportData?.risk_level || 'low';
            draftStatusToSave = aiReportData?.draft_status || 'ready';
            
            const aiAdminTag = aiReportData?._debug?.admin_tag || aiReportData?.admin_tag;
            qualityTag = determineQualityTag(true, subjectCount, lessonCount, aiAdminTag);

            // VERBATIM-COMMENT-INTEGRATE-V1 (원장 방침 2026-07-29):
            // 이재진(영어) 담당 학생의 주간 코멘트는 generate-ai-report가 영어 문단에
            // 원문 그대로(연결만 다듬어) 통합한다. 여기서는 통합이 실제로 됐는지 검증하고,
            // 실패한 코멘트만 안전장치로 원문 섹션을 뒤에 붙인다.
            // (lesson_records.teacher_id에는 profiles FK가 없어 embed 금지 — teacher_display_name 사용)
            const VERBATIM_COMMENT_TEACHER_IDS = [
              '916c5055-2a8c-46d8-b84c-fd280d7f541f', // 이재진(영어)
            ];
            const { data: weeklySummaries, error: weeklySummaryErr } = await supabase
              .from('lesson_records')
              .select('weekly_summary, subject, teacher_id, teacher_display_name, lesson_date, weekly_summary_week')
              .eq('student_id', student.id)
              .in('teacher_id', VERBATIM_COMMENT_TEACHER_IDS)
              .not('weekly_summary', 'is', null)
              .or(`weekly_summary_week.eq.${weekStart},and(lesson_date.gte.${weekStart},lesson_date.lte.${weekEnd})`);
            if (weeklySummaryErr) console.error('weekly_summary load failed:', weeklySummaryErr.message);

            // 코멘트 문장 앞부분들이 본문에 얼마나 살아있는지로 통합 여부 판정
            const isIntegrated = (comment: string, body: string) => {
              const probes = comment
                .split(/\n+|(?<=다\.)\s*/)
                .map((s) => s.trim())
                .filter((s) => s.length >= 15)
                .map((s) => s.slice(0, 15));
              if (probes.length === 0) return body.includes(comment.trim().slice(0, 10));
              const hit = probes.filter((p) => body.includes(p)).length;
              return hit >= Math.max(1, Math.floor(probes.length * 0.3));
            };

            const seen = new Set<string>();
            const summaryBlocks: string[] = [];
            let totalComments = 0;
            let integratedCount = 0;
            for (const r of (weeklySummaries || []) as any[]) {
              const key = `${r.teacher_id}|${r.subject}|${r.weekly_summary}`;
              if (seen.has(key)) continue;
              seen.add(key);
              totalComments++;
              if (isIntegrated(r.weekly_summary, aiReportData.parent_message || '')) {
                integratedCount++;
                continue;
              }
              const name = r.teacher_display_name || '담당 선생님';
              summaryBlocks.push(`【${r.subject} ${name}】\n${r.weekly_summary}`);
            }
            const summaryAppendix = summaryBlocks.length > 0
              ? `\n\n---\n💬 담당 선생님 주간 코멘트\n\n${summaryBlocks.join('\n\n')}`
              : '';
            const missingTag = totalComments === 0
              ? ' weekly_summary=MISSING'
              : ` weekly_summary=${totalComments} integrated=${integratedCount} appended=${summaryBlocks.length}`;

            const debugLine = `[REPORT_GEN_DEBUG_V2.4] templateVersion=${TEMPLATE_VERSION} tag=${qualityTag} validator=pass retries=${aiAttempts - 1}${missingTag}`;
            
            // parent_message from generate-ai-report already includes the header, so don't add it again
            finalParentMessageToSave = `${NARRATIVE_RENDER_PREFIX}\n\n${debugLine}\n\n${aiReportData.parent_message}${summaryAppendix}`;
            finalStudentMessageToSave = aiReportData?.student_message || null;
          }

          // WEEKLY-REPORT-SAFETY-V1: 저장 전 서버측 문안 검증 (외부 노출 텍스트 전체)
          const hasLessonData = lessonCount > 0;
          const externalText = [
            aiReportData?.parent_message || '',
            aiReportData?.student_message || '',
            typeof aiReportData?.subject_breakdown === 'string'
              ? aiReportData.subject_breakdown
              : aiReportData?.subject_breakdown
                ? JSON.stringify(aiReportData.subject_breakdown)
                : '',
          ].join('\n\n');

          const safety = aiReportData
            ? scanSafety(externalText, { hasLessonData })
            : { pass: true, violations: [] as string[] };

          if (aiReportData && !safety.pass) {
            safetyFallback = true;
            safetyViolations = safety.violations as string[];
            validationFallbackCount++;
            const header = formatParentHeader(student.name, weekStart, weekEnd);
            const debugLine = `[REPORT_GEN_DEBUG_V2.4] templateVersion=${TEMPLATE_VERSION} tag=RED validation_fallback=true violations=${safetyViolations.join(';')}`;
            finalParentMessageToSave = `${NARRATIVE_RENDER_PREFIX}\n\n${debugLine}\n\n${neutralParentTemplate(header, hasLessonData)}`;
            finalStudentMessageToSave = neutralStudentTemplate(hasLessonData);
            qualityTag = 'RED';
            draftStatusToSave = 'needs_input';
            console.warn(`[generate-weekly-reports] SAFETY_FALLBACK ${student.name}: ${safetyViolations.join(';')}`);
          } else if (aiReportData && !hasLessonData) {
            // 제출완료 수업기록 0건 → 평가 문안 대신 데이터 부족/관찰 필요 문안
            safetyFallback = true;
            safetyViolations = ['NO_LESSON_DATA'];
            validationFallbackCount++;
            const header = formatParentHeader(student.name, weekStart, weekEnd);
            const debugLine = `[REPORT_GEN_DEBUG_V2.4] templateVersion=${TEMPLATE_VERSION} tag=RED validation_fallback=true violations=NO_LESSON_DATA`;
            finalParentMessageToSave = `${NARRATIVE_RENDER_PREFIX}\n\n${debugLine}\n\n${neutralParentTemplate(header, false)}`;
            finalStudentMessageToSave = neutralStudentTemplate(false);
            qualityTag = 'RED';
            draftStatusToSave = 'needs_input';
          }



          // Calculate stats
          let avgUnderstanding: number | null = null;
          let homeworkCompletionRate: number | null = null;
          const commonIssues: string[] = [];

          if (lessons && lessons.length > 0) {
            const scores = lessons.map((l) => l.understanding_score).filter((s) => s !== null);
            if (scores.length > 0) {
              avgUnderstanding = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
            }

            // HW-RATE-FIX + HW-MERGE-V1: enum values are completed/partial/not_done/none_assigned.
            // Combine lesson_records.homework_status AND homework_assignments (DailyHomeworkChecklist).
            const hwLessons = lessons.filter(
              (l) => l.homework_status && l.homework_status !== 'none_assigned' && l.homework_status !== 'none'
            );
            let hwCount = hwLessons.length;
            let hwScore = hwLessons.reduce((acc, l) => {
              if (l.homework_status === 'completed') return acc + 1;
              if (l.homework_status === 'partial') return acc + 0.5;
              return acc;
            }, 0);

            // WEEKLY-REPORT-REPAIR-V1: 해당 주 제출 일지에 lesson_record_id로 연결된 숙제만 집계.
            // 미연결(regular 고아) 숙제는 주간리포트 통계에 섞지 않는다.
            const weekLessonIds = (lessons || []).map((l) => l.id);
            const { data: hwAssignments } = weekLessonIds.length > 0
              ? await supabase
                  .from('homework_assignments')
                  .select('result, check_status, assigned_date, checked_at, lesson_record_id')
                  .eq('student_id', student.id)
                  .in('lesson_record_id', weekLessonIds)
                  .eq('check_status', 'checked')
              : { data: [] as any[] };

            for (const a of hwAssignments || []) {
              const checkedDate = a.checked_at ? String(a.checked_at).slice(0, 10) : null;
              const countedInWeek = (a.assigned_date >= weekStart && a.assigned_date <= weekEnd) || (!!checkedDate && checkedDate >= weekStart && checkedDate <= weekEnd);
              if (!countedInWeek) continue;
              const r = a.result;
              if (!r || r === 'unable_to_verify') continue;
              if (r === 'completed' || r === 'low_effort_completed') { hwCount++; hwScore += 1; }
              else if (r === 'partial') { hwCount++; hwScore += 0.5; }
              else if (r === 'not_done' || r === 'low_effort' || r === 'lost') { hwCount++; }
            }

            if (hwCount > 0) {
              homeworkCompletionRate = Math.round((hwScore / hwCount) * 100);
            }
          }

          let riskLevel: string | null = riskLevelFromAi || 'low';
          if (lessonCount === 0) {
            riskLevel = null;
          }

          const dataDebugStr = `DATA_DEBUG: fetched=${debugTotal} submitted=${debugSubmitted} draft=${debugDraft} subjects=${JSON.stringify(debugSubjects)}`;
          const debugInfoStr = `[REPORT_GEN_DEBUG_V2.4] templateVersion=${TEMPLATE_VERSION} mode=direct_save validator=${validatorStatus} retries=${Math.max(0, aiAttempts - 1)} tag=${qualityTag} violations=${validatorViolations.join(';') || 'none'} validation_fallback=${safetyFallback} safety_violations=${safetyViolations.join(';') || 'none'} | ${dataDebugStr}`;

          // WEEKLY-REPORT-SAFEPATH-V2: blind upsert 금지.
          // 기존 행이 없으면 insert, force로 허용된 기존(비공개·미발송) 행만 id로 update.
          currentStage = 'save_report';
          const payload = {
            student_id: student.id,
            week_start: weekStart,
            week_end: weekEnd,
            total_lessons: lessonCount,
            avg_understanding: avgUnderstanding,
            homework_completion_rate: homeworkCompletionRate,
            common_issues: commonIssues,
            risk_level: riskLevel,
            summary: draftStatusToSave,
            parent_message: finalParentMessageToSave,
            student_message: finalStudentMessageToSave,
            generated_at: new Date().toISOString(),
            debug_info: debugInfoStr,
            report_quality_tag: qualityTag,
            parent_visible: false,
          };

          const existingRow = existingMap.get(student.id);
          const { error: upsertError } = existingRow?.id
            ? await supabase.from('weekly_reports').update(payload).eq('id', existingRow.id)
            : await supabase.from('weekly_reports').insert(payload);


          if (upsertError) {
            console.error(`[generate-weekly-reports] Upsert error for ${student.name}:`, upsertError);
            const detail: ErrorDetail = {
              student_id: student.id,
              student_name: student.name,
              error_stage: 'save_report',
              error_message: upsertError.message,
              error_code: upsertError.code || undefined,
              fetched_lesson_records_count: debugTotal,
              submitted_count: debugSubmitted,
              draft_count: debugDraft,
            };
            errorDetails.push(detail);
            errors.push(`${student.name}: ERROR_DETAIL: stage=save_report code=${upsertError.code || 'N/A'} msg=${upsertError.message} fetched=${debugTotal}`);
            errorCount++;
            continue;
          }

          successCount++;
          console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG_V2.4: Saved ${student.name} with tag=${qualityTag}`);
          
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : 'Unknown error';
          const errCode = (e as any)?.code || 'N/A';
          console.error(`[generate-weekly-reports] Error processing ${student.name}:`, errMsg);
          
          // REPORT-ERROR-DETAIL-V1: Capture full error detail
          const detail: ErrorDetail = {
            student_id: student.id,
            student_name: student.name,
            error_stage: currentStage,
            error_message: errMsg,
            error_code: errCode !== 'N/A' ? errCode : undefined,
            fetched_lesson_records_count: debugTotal,
            submitted_count: debugSubmitted,
            draft_count: debugDraft,
          };
          errorDetails.push(detail);
          errors.push(`${student.name}: ERROR_DETAIL: stage=${currentStage} code=${errCode} msg=${errMsg} fetched=${debugTotal}`);
          console.error(`[ERROR_DETAIL] ${student.name}: stage=${currentStage} code=${errCode} msg=${errMsg} fetched=${debugTotal} submitted=${debugSubmitted} draft=${debugDraft}`);
          
          // Also store error in weekly_reports.debug_info for visibility in UI
          // WEEKLY-REPORT-REPAIR-V1: 기존 리포트가 있으면 오류 행으로 덮어쓰지 않는다.
          try {
            const errorDebugStr = `[REPORT_GEN_DEBUG_V2.4] ERROR_DETAIL: stage=${currentStage} code=${errCode} msg=${errMsg} fetched=${debugTotal} submitted=${debugSubmitted} draft=${debugDraft}`;
            if (!existingMap.has(student.id)) {
              await supabase
                .from('weekly_reports')
                .insert({
                  student_id: student.id,
                  week_start: weekStart,
                  week_end: weekEnd,
                  total_lessons: 0,
                  risk_level: 'high',
                  summary: 'error',
                  parent_message: null,
                  student_message: null,
                  generated_at: new Date().toISOString(),
                  debug_info: errorDebugStr,
                  report_quality_tag: 'RED',
                  parent_visible: false,
                });
            } else {
              console.warn('[generate-weekly-reports] Skipped error-row overwrite (existing report)');
            }
          } catch (saveErr) {
            console.error(`[generate-weekly-reports] Failed to save error debug_info for ${student.name}`, saveErr);
          }

          
          errorCount++;
        }
      }

      // Log job result with error details
      const errorDetailsSummary = errorDetails.length > 0
        ? ' | ERRORS: ' + errorDetails.map(e => `${e.student_name}[${e.error_stage}:${e.error_code || 'N/A'}]`).join(', ')
        : '';
      
      await supabase.from('weekly_jobs_log').insert({
        job_name: 'generate_weekly_reports',
        week_start: weekStart,
        week_end: weekEnd,
        status: errorCount === 0 ? 'completed' : 'partial',
        message: `Direct save v2.4: ${successCount} success, ${errorCount} errors, ${validationFallbackCount} validation_fallback${errorDetailsSummary}`,
        scheduler_source: schedulerSource,
        schedule_text: SCHEDULE_CONFIG.schedule_text,
      });

      const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

      // REPORT-ERROR-PANEL-V1: Always return structured errors array for UI consumption
      const structuredErrors = errorDetails.map((e) => ({
        student_id: e.student_id,
        student_name: e.student_name,
        stage: e.error_stage,
        message: e.error_message,
        code: e.error_code || null,
        fetched_total: e.fetched_lesson_records_count,
        fetched_submitted: e.submitted_count,
        fetched_draft: e.draft_count,
      }));

      return new Response(
        JSON.stringify({
          status: errorCount === 0 ? 'success' : 'partial',
          execution_mode: 'safe_per_student',

          success: errorCount === 0,
          weekStart,
          weekEnd,
          message: `Direct save v2.4: ${successCount} reports generated, ${errorCount} errors`,
          schedulerSource,
          scope,
          count: studentIds?.length || 'all',
          successCount,
          errorCount,
          validationFallbackCount,
          // REPORT-ERROR-PANEL-V1: Always include errors array (empty if none)
          errors: structuredErrors,
          _debug: {
            source: 'edge_function_direct_save_v2.4',
            scope,
            count: studentIds?.length || 'all',
            templateVersion: TEMPLATE_VERSION,
            time: nowKST,
            handler: 'generate-weekly-reports/index.ts',
            mode: 'direct_save_sendable_lock',
            marker: 'REPORT-ERROR-PANEL-V1',
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: errorCount === 0 ? 200 : 207,
        }
      );
    }

    // ============================================================
    // LEGACY MODE: DB RPC — 명시적 mode='legacy_rpc' + confirm_legacy_rpc=true 전용
    // ============================================================
    if (!legacyAllowed) {
      return new Response(
        JSON.stringify({
          success: false,
          execution_mode: 'blocked_legacy_rpc',
          error: 'LEGACY_RPC_DISABLED: legacy RPC path is not selectable automatically.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log(`[generate-weekly-reports] REPORT_GEN_DEBUG_V2.4: Using LEGACY DB RPC mode (explicitly confirmed)`);


    const rpcParams: Record<string, unknown> = {
      _week_start: weekStart,
      _week_end: weekEnd,
    };
    if (studentIds && studentIds.length > 0) {
      rpcParams._student_ids = studentIds;
    }
    
    const { error: rpcError } = await supabase.rpc('generate_weekly_reports_scheduled', rpcParams);

    if (rpcError) {
      console.error('[generate-weekly-reports] RPC error:', rpcError);
      
      await supabase.from('weekly_jobs_log').insert({
        job_name: 'generate_weekly_reports',
        week_start: weekStart,
        week_end: weekEnd,
        status: 'failed',
        message: rpcError.message,
        scheduler_source: schedulerSource,
        schedule_text: SCHEDULE_CONFIG.schedule_text,
      });
      
      throw rpcError;
    }

    console.log('[generate-weekly-reports] REPORT_GEN_DEBUG_V2.4: Reports generated successfully (legacy mode)');

    await supabase.from('weekly_jobs_log').insert({
      job_name: 'generate_weekly_reports',
      week_start: weekStart,
      week_end: weekEnd,
      status: 'completed',
      message: `Legacy mode completed at ${new Date().toISOString()}`,
      scheduler_source: schedulerSource,
      schedule_text: SCHEDULE_CONFIG.schedule_text,
    });

    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

    return new Response(
      JSON.stringify({
        success: true,
        weekStart,
        weekEnd,
        execution_mode: 'legacy_rpc',
        message: 'Weekly reports generated successfully (legacy mode)',
        schedulerSource,
        scope,
        count: studentIds?.length || 'all',
        _debug: {
          source: 'edge_function_legacy_rpc',
          scope,
          count: studentIds?.length || 'all',
          templateVersion,
          time: nowKST,
          handler: 'generate-weekly-reports/index.ts',
          mode: 'legacy_rpc',
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[generate-weekly-reports] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
