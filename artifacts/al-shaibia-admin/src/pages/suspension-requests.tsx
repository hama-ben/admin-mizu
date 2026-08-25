import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Clock, Loader2, RefreshCw, Unlock, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import type { DriverSuspensionRequest, SuspensionRequestReason } from "@/lib/supabase";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

const REASON_LABELS: Record<SuspensionRequestReason, string> = {
  truck_issue: "مشكلة في الشاحنة",
  medical: "سبب مرضي",
  personal_leave: "عطلة شخصية",
  other: "سبب آخر",
};

function reasonLabel(request: DriverSuspensionRequest) {
  return request.reason === "other" && request.reason_text
    ? `سبب آخر: ${request.reason_text}`
    : REASON_LABELS[request.reason];
}

function RequestCard({
  request,
  onDecision,
  onLift,
  actionLoading,
}: {
  request: DriverSuspensionRequest;
  onDecision: (request: DriverSuspensionRequest, status: "approved" | "rejected") => void;
  onLift: (request: DriverSuspensionRequest) => void;
  actionLoading: string | null;
}) {
  const pending = request.status === "pending";
  const canLift = request.status === "approved" && request.request_type === "suspend";
  const driverName = request.driver?.name || request.driver_id;
  return (
    <Card className={pending ? "border-amber-500/40 bg-amber-500/[0.03]" : ""}>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{driverName}</h3>
              <Badge variant="outline" className={request.request_type === "suspend"
                ? "border-red-500/30 bg-red-500/10 text-red-400"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}>
                {request.request_type === "suspend" ? "طلب تعليق" : "طلب إلغاء تعليق"}
              </Badge>
              {!pending && (
                <Badge variant="outline" className={request.status === "approved"
                  ? "border-emerald-500/30 text-emerald-400"
                  : "border-muted-foreground/30 text-muted-foreground"}>
                  {request.status === "approved" ? "تمت الموافقة" : "مرفوض"}
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {request.driver?.phone && <span>{request.driver.phone}</span>}
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{new Date(request.created_at).toLocaleString("ar-DZ")}</span>
            </div>
          </div>
          {pending && <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-400">قيد المراجعة</span>}
        </div>
        <div className="mt-4 rounded-lg border border-border bg-background/40 p-3">
          <p className="text-xs text-muted-foreground">السبب</p>
          <p className="mt-1 text-sm leading-relaxed">{reasonLabel(request)}</p>
        </div>
        {!pending && canLift && (
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              onClick={() => onLift(request)}
              disabled={actionLoading === request.id}
              className="gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
            >
              {actionLoading === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
              إلغاء تعليق الحساب
            </Button>
          </div>
        )}
        {pending && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onDecision(request, "rejected")} disabled={actionLoading === request.id} className="gap-2 text-red-400">
              {actionLoading === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} رفض
            </Button>
            <Button onClick={() => onDecision(request, "approved")} disabled={actionLoading === request.id} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
              {actionLoading === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} موافقة
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SuspensionRequestsPage() {
  const [requests, setRequests] = useState<DriverSuspensionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  async function loadRequests(background = false) {
    if (!background) setLoading(true);
    try {
      const data = await api.get<DriverSuspensionRequest[]>("/suspension-requests");
      setRequests(data);
    } catch (error: any) {
      if (!background) toast({ title: "تعذر جلب طلبات التعليق", description: error.message, variant: "destructive" });
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => { loadRequests(); }, []);
  useAutoRefresh(() => loadRequests(true));

  async function decide(request: DriverSuspensionRequest, status: "approved" | "rejected") {
    setActionLoading(request.id);
    try {
      await api.post(`/suspension-requests/${request.id}/decision`, { status });
      toast({ title: status === "approved" ? "تمت الموافقة على الطلب" : "تم رفض الطلب", description: `تم تحديث طلب ${request.driver?.name || request.driver_id}.` });
      await loadRequests(true);
    } catch (error: any) {
      toast({ title: "فشل تنفيذ القرار", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  async function lift(request: DriverSuspensionRequest) {
    const driverName = request.driver?.name || request.driver_id;
    if (!window.confirm(`هل تريد إلغاء تعليق حساب ${driverName}؟`)) return;

    setActionLoading(request.id);
    try {
      await api.post(`/suspension-requests/${request.id}/lift`);
      toast({ title: "تم إلغاء تعليق الحساب", description: `تم تفعيل حساب ${driverName} مرة أخرى.` });
      await loadRequests(true);
    } catch (error: any) {
      toast({ title: "فشل إلغاء التعليق", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  const pending = useMemo(() => requests.filter((request) => request.status === "pending"), [requests]);
  const history = useMemo(() => requests.filter((request) => request.status !== "pending"), [requests]);

  return (
    <div className="animate-in fade-in space-y-8 p-4 duration-500 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><ClipboardList className="h-7 w-7 text-primary" /><h1 className="text-3xl font-bold tracking-tight">طلبات التعليق</h1></div>
          <p className="mt-2 text-muted-foreground">راجع طلبات تعليق حسابات السائقين أو إلغاء تعليقها.</p>
        </div>
        <Button variant="outline" onClick={() => loadRequests()} disabled={loading} className="gap-2"><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> تحديث</Button>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-2"><h2 className="text-xl font-semibold">الطلبات المعلّقة</h2><Badge>{pending.length}</Badge></div>
        {loading ? <div className="space-y-4">{[1, 2].map((item) => <Card key={item}><CardContent className="space-y-3 p-5"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-12 w-full" /></CardContent></Card>)}</div>
          : pending.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد طلبات معلّقة حالياً.</CardContent></Card>
           : <div className="space-y-4">{pending.map((request) => <RequestCard key={request.id} request={request} onDecision={decide} onLift={lift} actionLoading={actionLoading} />)}</div>}
      </section>

      <section className="space-y-4">
        <CardHeader className="px-0"><CardTitle className="text-xl">السجل التاريخي</CardTitle></CardHeader>
        {history.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground">لا توجد طلبات منتهية بعد.</CardContent></Card>
           : <div className="space-y-4">{history.map((request) => <RequestCard key={request.id} request={request} onDecision={decide} onLift={lift} actionLoading={actionLoading} />)}</div>}
      </section>
    </div>
  );
}