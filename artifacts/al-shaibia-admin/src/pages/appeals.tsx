import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { supabase, type User } from "@/lib/supabase";
import { authedFetch } from "@/lib/api";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { Check, Clock, FileText, MapPin, Phone, Save, Search, UserCheck } from "lucide-react";

interface DriverAppeal {
  id: string;
  driver_id: string;
  message: string | null;
  reason: string | null;
  status: "pending" | "reviewed";
  admin_response: string | null;
  created_at: string;
  reviewed_at: string | null;
  driver: User | null;
}

type ScopeFilter = "all" | "pending" | "accepted" | "banned" | "expired" | "rejected";

const SCOPE_LABELS: Record<ScopeFilter, string> = {
  all: "كل الطعون",
  pending: "قيد المراجعة",
  accepted: "المقبولة والمفعّلة",
  banned: "المحظورة",
  expired: "المنتهية",
  rejected: "المرفوضة",
};

function isExpired(driver: User | null): boolean {
  return !!driver
    && driver.account_status === "approved"
    && !!driver.subscription_expires_at
    && new Date(driver.subscription_expires_at).getTime() < Date.now();
}

function getScope(driver: User | null): Exclude<ScopeFilter, "all" | "pending"> | "other" {
  if (!driver) return "other";
  if (driver.account_status === "banned") return "banned";
  if (driver.account_status === "rejected") return "rejected";
  if (isExpired(driver)) return "expired";
  if (driver.account_status === "approved") return "accepted";
  return "other";
}

function scopeClass(scope: ReturnType<typeof getScope>): string {
  if (scope === "banned") return "bg-zinc-700/40 text-zinc-300 border-zinc-500/30";
  if (scope === "expired") return "bg-orange-500/10 text-orange-400 border-orange-500/20";
  if (scope === "rejected") return "bg-red-500/10 text-red-400 border-red-500/20";
  if (scope === "accepted") return "bg-green-500/10 text-green-400 border-green-500/20";
  return "bg-slate-500/10 text-slate-400 border-slate-500/20";
}

function scopeLabel(scope: ReturnType<typeof getScope>): string {
  if (scope === "banned") return "حساب محظور";
  if (scope === "expired") return "حساب منتهي";
  if (scope === "rejected") return "طلب مرفوض";
  if (scope === "accepted") return "حساب مقبول ومفعّل";
  return "حساب آخر";
}

export default function AppealsPage() {
  const [appeals, setAppeals] = useState<DriverAppeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const { toast } = useToast();

  async function fetchAppeals(isBackground = false) {
    if (!isBackground) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("driver_appeals")
        .select("id, driver_id, message, reason, status, admin_response, created_at, reviewed_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const driverIds = [...new Set((data ?? []).map((appeal) => appeal.driver_id).filter(Boolean))];
      let drivers: User[] = [];
      if (driverIds.length > 0) {
        const { data: driverData, error: driversError } = await supabase
          .from("users")
          .select("id, name, phone, email, wilaya, commune, account_status, user_type, subscription_expires_at, created_at")
          .in("id", driverIds);
        if (driversError) throw driversError;
        drivers = driverData ?? [];
      }

      const driversMap = new Map(drivers.map((driver) => [driver.id, driver]));
      setAppeals((data ?? []).map((appeal) => ({
        ...appeal,
        driver: driversMap.get(appeal.driver_id) ?? null,
      })));
    } catch (err: any) {
      if (!isBackground) {
        toast({ title: "تعذر جلب الطعون", description: err.message, variant: "destructive" });
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  useEffect(() => { fetchAppeals(false); }, []);
  useAutoRefresh(() => fetchAppeals(true), 10000);

  const filteredAppeals = useMemo(() => {
    const query = search.trim().toLowerCase();
    return appeals.filter((appeal) => {
      const scope = getScope(appeal.driver);
      const matchesScope = scopeFilter === "all"
        || (scopeFilter === "pending" && appeal.status === "pending")
        || scope === scopeFilter;
      if (!matchesScope) return false;
      if (!query) return true;
      return appeal.message?.toLowerCase().includes(query)
        || appeal.reason?.toLowerCase().includes(query)
        || appeal.driver?.name?.toLowerCase().includes(query)
        || appeal.driver?.phone?.toLowerCase().includes(query)
        || appeal.driver_id.toLowerCase().includes(query);
    });
  }, [appeals, search, scopeFilter]);

  async function markReviewed(appeal: DriverAppeal) {
    const note = (notes[appeal.id] ?? appeal.admin_response ?? "").trim();
    setActionLoading(`review-${appeal.id}`);
    try {
      const { error } = await supabase
        .from("driver_appeals")
        .update({
          status: "reviewed",
          reviewed_at: new Date().toISOString(),
          admin_response: note || null,
        })
        .eq("id", appeal.id);
      if (error) throw error;
      toast({ title: "تمت مراجعة الطعن", description: "تم حفظ ملاحظة الإدارة." });
      await fetchAppeals(true);
    } catch (err: any) {
      toast({ title: "فشل حفظ المراجعة", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  async function acceptAppeal(appeal: DriverAppeal) {
    if (!appeal.driver) return;
    const scope = getScope(appeal.driver);
    if (scope === "other") {
      await markReviewed(appeal);
      return;
    }

    setActionLoading(`accept-${appeal.id}`);
    try {
      const endpoint = scope === "banned"
        ? `/users/${encodeURIComponent(appeal.driver.id)}/unban`
        : `/drivers/${encodeURIComponent(appeal.driver.id)}/approve`;
      const response = await authedFetch(endpoint, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(body.error ?? response.statusText);
      }

      const { error } = await supabase
        .from("driver_appeals")
        .update({
          status: "reviewed",
          reviewed_at: new Date().toISOString(),
          admin_response: (notes[appeal.id] ?? appeal.admin_response ?? "").trim() || null,
        })
        .eq("id", appeal.id);
      if (error) throw error;

      toast({
        title: "تم قبول الطعن",
        description: scope === "banned"
          ? `تم إلغاء حظر ${appeal.driver.name || "السائق"}.`
          : `تم تفعيل حساب ${appeal.driver.name || "السائق"}.`,
      });
      await fetchAppeals(true);
    } catch (err: any) {
      toast({ title: "فشل قبول الطعن", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  const pendingCount = appeals.filter((appeal) => appeal.status === "pending").length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الطعون</h1>
          <p className="text-muted-foreground mt-2">
            مراجعة طعون السائقين، مع الاحتفاظ بالحسابات المقبولة والمفعّلة في سجل الطعون — {loading ? "…" : `${appeals.length} طعن`}.
          </p>
        </div>
        <Link href="/banned-drivers">
          <Button variant="outline" className="gap-2">
            <UserCheck className="w-4 h-4" /> الحسابات المحظورة
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(SCOPE_LABELS) as ScopeFilter[]).map((filter) => (
          <Button
            key={filter}
            variant={scopeFilter === filter ? "default" : "outline"}
            size="sm"
            onClick={() => setScopeFilter(filter)}
          >
            {SCOPE_LABELS[filter]}
            {filter === "pending" && <Badge variant="secondary" className="mr-2">{pendingCount}</Badge>}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-card p-4 rounded-lg border border-border">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم أو الهاتف أو الرسالة..."
            className="pr-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground">{filteredAppeals.length} نتيجة</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array(6).fill(0).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredAppeals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-card border rounded-lg border-dashed">
          <FileText className="w-12 h-12 mb-4 opacity-30" />
          <h3 className="text-xl font-medium text-foreground">لا توجد طعون</h3>
          <p>ستظهر الطعون هنا عند تقديمها.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredAppeals.map((appeal) => {
            const scope = getScope(appeal.driver);
            const isPending = appeal.status === "pending";
            const busy = actionLoading !== null;
            return (
              <Card key={appeal.id} className="flex flex-col border-border bg-card">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="flex justify-between items-start gap-3 text-lg">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{appeal.driver?.name || "سائق غير موجود"}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-2 font-normal">
                        {appeal.driver?.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{appeal.driver.phone}</span>}
                        {(appeal.driver?.wilaya || scope === "expired") && (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{appeal.driver?.wilaya || "—"}</span>
                        )}
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(appeal.created_at).toLocaleDateString("ar-DZ")}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className={scopeClass(scope)}>{scopeLabel(scope)}</Badge>
                      <Badge variant="outline" className={isPending
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-green-500/10 text-green-400 border-green-500/20"}
                      >
                        {isPending ? "قيد المراجعة" : "تمت المراجعة"}
                      </Badge>
                    </div>
                  </CardTitle>
                </CardHeader>

                <CardContent className="p-4 flex-1 space-y-3">
                  {appeal.reason && (
                    <p className="text-xs text-muted-foreground">السبب: <span className="text-foreground">{appeal.reason}</span></p>
                  )}
                  <div className="rounded-md bg-muted/30 border border-border/60 p-3">
                    <p className="text-xs font-semibold text-primary mb-1">رسالة الطعن</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{appeal.message || "لا توجد رسالة"}</p>
                  </div>
                  <Textarea
                    placeholder="ملاحظة الإدارة..."
                    value={notes[appeal.id] ?? appeal.admin_response ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [appeal.id]: event.target.value }))}
                    className="text-sm resize-none min-h-20"
                    dir="rtl"
                    disabled={busy}
                  />
                  {appeal.admin_response && (
                    <p className="text-xs text-muted-foreground">آخر ملاحظة محفوظة: {appeal.admin_response}</p>
                  )}
                </CardContent>

                <CardFooter className="flex flex-col sm:flex-row gap-2 p-4 bg-muted/10 border-t border-border">
                  <Button
                    variant="outline"
                    className="w-full gap-1.5"
                    onClick={() => markReviewed(appeal)}
                    disabled={busy || !isPending}
                  >
                    <Save className="w-4 h-4" /> حفظ كمُراجع
                  </Button>
                  <Button
                    className="w-full gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => acceptAppeal(appeal)}
                    disabled={busy || !isPending}
                  >
                    <Check className="w-4 h-4" />
                    {scope === "banned" ? "قبول وإلغاء الحظر" : scope === "expired" ? "قبول وتجديد الحساب" : "قبول وتفعيل الحساب"}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}