import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { NewStudentRegistration, type NewStudentInitialData } from "@/components/admin/NewStudentRegistration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck, ClipboardCopy, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";

type Lead = NewStudentInitialData & {
  id: string;
  public_token: string;
  status: string;
  guardian_name: string | null;
  guardian_phone: string;
  learning_concern: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  appointment_at: string | null;
  created_at: string;
};

const STATUS = [
  ["requested", "예약 요청"],
  ["confirmed", "예약 확정"],
  ["intake_complete", "사전정보 완료"],
  ["consulted", "상담 완료"],
  ["enrollment_pending", "등록 대기"],
  ["converted", "등록 완료"],
  ["on_hold", "보류"],
  ["closed", "종료"],
] as const;

// PHONE_INTAKE_VALIDATION_START
type PhoneInquiryDraft = {
  studentName: string;
  guardianName: string;
  guardianPhone: string;
  school: string;
  concern: string;
};
const EMPTY_PHONE_INQUIRY: PhoneInquiryDraft = {
  studentName: "",
  guardianName: "",
  guardianPhone: "",
  school: "",
  concern: "",
};
export function buildPhoneInquiry(draft: PhoneInquiryDraft) {
  const studentName = draft.studentName.trim();
  const guardianName = draft.guardianName.trim();
  const phone = draft.guardianPhone.trim();
  const digits = phone.replace(/\D/g, "");
  const school = draft.school.trim();
  const concern = draft.concern.trim();
  if (!studentName) throw new Error("학생 이름을 입력해 주세요.");
  if (studentName.length > 100 || guardianName.length > 100 || school.length > 200 || concern.length > 2000) {
    throw new Error("입력 길이를 확인해 주세요. 이름 100자, 학교 200자, 문의 내용 2000자까지 입력할 수 있습니다.");
  }
  if (!/^[+\d\s()-]+$/.test(phone) || digits.length < 9 || digits.length > 15) {
    throw new Error("보호자 연락처를 확인해 주세요.");
  }
  return {
    student_name: studentName,
    guardian_name: guardianName || null,
    guardian_phone: phone,
    school: school || null,
    learning_concern: concern || null,
    consultation_summary: "[전화 문의 접수]",
    status: "requested",
    subjects: [],
  };
}
// PHONE_INTAKE_VALIDATION_END

export default function AdmissionsPipelinePage() {
  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <AdmissionsPipeline />
    </ProtectedRoute>
  );
}

function AdmissionsPipeline() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState<PhoneInquiryDraft>({ ...EMPTY_PHONE_INQUIRY });
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const phoneSavingRef = useRef(false);

  function changePhoneOpen(open: boolean) {
    if (phoneSavingRef.current) return;
    setPhoneOpen(open);
    if (!open) {
      setPhoneDraft({ ...EMPTY_PHONE_INQUIRY });
      setPhoneError("");
    }
  }
  async function savePhoneInquiry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phoneSavingRef.current) return;
    setPhoneError("");
    let payload: ReturnType<typeof buildPhoneInquiry>;
    try {
      payload = buildPhoneInquiry(phoneDraft);
    } catch (error) {
      setPhoneError(error instanceof Error ? error.message : "입력 내용을 확인해 주세요.");
      return;
    }
    phoneSavingRef.current = true;
    setPhoneSaving(true);
    try {
      const { data, error } = await (supabase as any).from("consultation_leads").insert(payload).select("*").single();
      if (error || !data)
        throw new Error("저장 결과를 확인하지 못했습니다. 목록을 새로고침해 접수 여부를 확인한 후 다시 시도해 주세요.");
      setRows((current) => [data as Lead, ...current]);
      setFilter("active");
      setPhoneDraft({ ...EMPTY_PHONE_INQUIRY });
      setPhoneOpen(false);
      toast.success("전화문의를 접수했습니다.");
    } catch {
      setPhoneError("저장 결과를 확인하지 못했습니다. 목록을 새로고침해 접수 여부를 확인한 후 다시 시도해 주세요.");
    } finally {
      phoneSavingRef.current = false;
      setPhoneSaving(false);
    }
  }
  const [userName, setUserName] = useState("원장");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("consultation_leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("상담 목록을 불러오지 못했습니다");
    setRows((data || []) as Lead[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (user)
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single()
        .then(({ data }) => setUserName((data as any)?.full_name || "원장"));
  }, [user]);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          filter === "all" ||
          (filter === "active" && !["converted", "closed"].includes(r.status)) ||
          r.status === filter,
      ),
    [rows, filter],
  );
  async function update(id: string, changes: Record<string, unknown>) {
    const { error } = await (supabase as any).from("consultation_leads").update(changes).eq("id", id);
    if (error) return toast.error("변경사항을 저장하지 못했습니다");
    setRows((v) => v.map((r) => (r.id === id ? ({ ...r, ...changes } as Lead) : r)));
  }
  async function copyIntake(lead: Lead) {
    await navigator.clipboard.writeText(`${location.origin}/consultation?token=${lead.public_token}`);
    toast.success("사전정보 입력 링크를 복사했습니다");
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => changePhoneOpen(true)}>
          <UserPlus className="w-4 h-4 mr-1" />
          전화문의 접수
        </Button>
      </div>
      <Dialog open={phoneOpen} onOpenChange={changePhoneOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>전화문의 접수</DialogTitle>
            <DialogDescription>
              전화로 받은 문의를 상담 목록에 추가합니다. 상담 일정과 등록 여부는 접수 후 정할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={savePhoneInquiry} className="space-y-4">
            <fieldset disabled={phoneSaving} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="phone-student">학생 이름 *</Label>
                <Input
                  id="phone-student"
                  required
                  maxLength={100}
                  value={phoneDraft.studentName}
                  onChange={(e) => setPhoneDraft((v) => ({ ...v, studentName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone-guardian">보호자 이름</Label>
                <Input
                  id="phone-guardian"
                  maxLength={100}
                  value={phoneDraft.guardianName}
                  onChange={(e) => setPhoneDraft((v) => ({ ...v, guardianName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone-number">보호자 연락처 *</Label>
                <Input
                  id="phone-number"
                  type="tel"
                  required
                  maxLength={30}
                  autoComplete="off"
                  value={phoneDraft.guardianPhone}
                  onChange={(e) => setPhoneDraft((v) => ({ ...v, guardianPhone: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone-school">학교</Label>
                <Input
                  id="phone-school"
                  maxLength={200}
                  value={phoneDraft.school}
                  onChange={(e) => setPhoneDraft((v) => ({ ...v, school: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone-concern">문의 내용</Label>
                <Textarea
                  id="phone-concern"
                  maxLength={2000}
                  rows={4}
                  value={phoneDraft.concern}
                  onChange={(e) => setPhoneDraft((v) => ({ ...v, concern: e.target.value }))}
                />
              </div>
            </fieldset>
            {phoneError && (
              <p role="alert" className="text-sm text-destructive">
                {phoneError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={phoneSaving} onClick={() => changePhoneOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={phoneSaving}>
                {phoneSaving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {phoneSaving ? "저장 중" : "전화문의 저장"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">학생 관리</p>
          <h1 className="text-2xl font-bold">상담·등록 파이프라인</h1>
          <p className="text-sm text-muted-foreground">예약부터 등록·인계까지 멈춘 학생을 한 화면에서 확인합니다.</p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">진행 중</SelectItem>
              <SelectItem value="all">전체</SelectItem>
              {STATUS.map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-1" />
            새로고침
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            표시할 상담 예정자가 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="grid xl:grid-cols-2 gap-3">
          {visible.map((lead) => (
            <Card key={lead.id} className="border-border/60">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {lead.student_name}{" "}
                      <span className="font-normal text-muted-foreground">
                        {lead.school_level}
                        {lead.grade_year}
                      </span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {lead.school || "학교 미입력"} · {lead.subjects?.join(", ") || "과목 미정"}
                    </p>
                  </div>
                  <Badge variant="secondary">{STATUS.find(([v]) => v === lead.status)?.[1] || lead.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-muted/40 p-2">
                    <b>보호자</b>
                    <br />
                    {lead.guardian_name || "-"} · {lead.guardian_phone}
                  </div>
                  <div className="rounded bg-muted/40 p-2">
                    <b>희망 일정</b>
                    <br />
                    {lead.preferred_date || "-"} {lead.preferred_time || ""}
                  </div>
                </div>
                {lead.learning_concern && (
                  <p className="text-xs border-l-2 pl-2 line-clamp-3">{lead.learning_concern}</p>
                )}
                <div className="grid sm:grid-cols-[1fr_1fr] gap-2">
                  <Select value={lead.status} onValueChange={(status) => update(lead.id, { status })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS.map(([v, l]) => (
                        <SelectItem key={v} value={v}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="datetime-local"
                    className="h-9"
                    value={lead.appointment_at?.slice(0, 16) || ""}
                    onChange={(e) =>
                      update(lead.id, {
                        appointment_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                        status: e.target.value ? "confirmed" : lead.status,
                      })
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyIntake(lead)}>
                    <ClipboardCopy className="w-4 h-4 mr-1" />
                    사전정보 링크
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => update(lead.id, { status: "consulted" })}>
                    <CalendarCheck className="w-4 h-4 mr-1" />
                    상담 완료
                  </Button>
                  {lead.status !== "converted" && (
                    <Button size="sm" onClick={() => setSelected(lead)}>
                      <UserPlus className="w-4 h-4 mr-1" />
                      등록 전환
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <NewStudentRegistration
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        userName={userName}
        initialData={selected || undefined}
        onCreated={async (studentId) => {
          if (selected && studentId)
            await update(selected.id, { status: "converted", converted_student_id: studentId });
          setSelected(null);
        }}
      />
    </div>
  );
}
