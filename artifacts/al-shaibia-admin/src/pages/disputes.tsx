import { useEffect, useState, useMemo } from "react";
import { type RatingDispute, type DisputeStatus } from "@/lib/supabase";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/constants";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Search, Eye, Star } from "lucide-react";

const STATUS_LABELS: Record<DisputeStatus, string> = {
  pending: "معلق",
  resolved: "تمت المعالجة",
  dismissed: "مغلق",
};

const STATUS_STYLES: Record<DisputeStatus, string> = {
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/20",
  resolved: "bg-green-500/20 text-green-400 border-green-500/20",
  dismissed: "bg-slate-500/20 text-slate-400 border-slate-500/20",
};

interface DisputeHistoryEntry {
  id: string;
  disputeId: string | null;
  driverId: string | null;
  rating: number;
  comment: string | null;
  wilaya: string | null;
  status: "resolved" | "dismissed";
  adminEmail: string | null;
  resolvedAt: string;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array(5).fill(0).map((_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}`} />
      ))}
      <span className="text-xs font-medium ml-1 text-muted-foreground">{rating}/5</span>
    </div>
  );
}

/*
 * MIGRATION NOTE — run once in Supabase SQL editor:
 *
 *   ALTER TABLE public.ratings
 *   ADD COLUMN IF NOT EXISTS dispute_status text DEFAULT 'pending'
 *   CHECK (dispute_status IN ('pending', 'resolved', 'dismissed'));
 *
 * This adds the dispute_status column that allows admins to mark
 * disputed ratings as resolved or dismissed.
 */

/** Map a raw `ratings` row to the RatingDispute UI shape. */
function mapRow(row: Record<string, any>): RatingDispute {
  return {
    id: row.id,
    driver_id: row.rated_user_id ?? null,
    rating: row.stars ?? 0,
    comment: row.dispute_reason ?? row.comment ?? null,
    wilaya: null, // not stored in ratings table
    status: (row.dispute_status as DisputeStatus) ?? "pending",
    created_at: row.created_at,
  };
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<RatingDispute[]>([]);
  const [history, setHistory] = useState<DisputeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [view, setView] = useState<"pending" | "history">("pending");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<RatingDispute | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchDisputes();
    fetchHistory();
  }, []);
  useAutoRefresh(async () => {
    await Promise.all([fetchDisputes(true), fetchHistory(true)]);
  }, 10000);

  async function fetchDisputes(background = false) {
    if (!background) setLoading(true);
    try {
      const data = await api.get<RatingDispute[]>("/disputes");
      setDisputes(data ?? []);
    } catch (err: any) {
      if (!background) {
        toast({ title: "خطأ في جلب البيانات", description: err.message, variant: "destructive" });
      }
    } finally {
      if (!background) setLoading(false);
    }
  }

  async function fetchHistory(background = false) {
    if (!background) setHistoryLoading(true);
    try {
      const data = await api.get<DisputeHistoryEntry[]>("/disputes/history");
      setHistory(data ?? []);
    } catch (err: any) {
      if (!background) {
        toast({ title: "تعذر جلب سجل النزاعات", description: err.message, variant: "destructive" });
      }
    } finally {
      if (!background) setHistoryLoading(false);
    }
  }

  const handleStatusChange = async (id: string, status: DisputeStatus) => {
    try {
      // When resolved or dismissed, mark is_disputed = false so the rating is
      // removed from the disputes queue. To persist distinct resolved/dismissed
      // states, run the migration in the comment above to add dispute_status.
      await api.patch(`/disputes/${encodeURIComponent(id)}`, { status });
      if (status !== "pending") {
        setDisputes((prev) => prev.filter((d) => d.id !== id));
        if (selected?.id === id) setSelected(null);
      } else {
        setDisputes((prev) => prev.map((d) => d.id === id ? { ...d, status } : d));
        if (selected?.id === id) setSelected((s) => s ? { ...s, status } : null);
      }
      await fetchHistory(true);
      toast({ title: "تم تحديث الحالة", description: `"${STATUS_LABELS[status]}"` });
    } catch (err: any) {
      toast({ title: "فشل التحديث", description: err.message, variant: "destructive" });
    }
  };

  const filtered = useMemo(() => disputes.filter((d) => {
    const matchSearch = !search || d.comment?.toLowerCase().includes(search.toLowerCase()) || d.driver_id?.includes(search) || d.wilaya?.includes(search);
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchSearch && matchStatus;
  }), [disputes, search, statusFilter]);

  const pendingCount = disputes.filter((d) => d.status === "pending").length;
  const filteredHistory = useMemo(() => history.filter((entry) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return entry.comment?.toLowerCase().includes(query)
      || entry.driverId?.toLowerCase().includes(query)
      || entry.wilaya?.toLowerCase().includes(query)
      || entry.adminEmail?.toLowerCase().includes(query);
  }), [history, search]);

  return (
    <div className="p-8 space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">النزاعات والشكاوى</h1>
          <p className="text-muted-foreground mt-1">مراجعة تقييمات السائقين والنزاعات.</p>
        </div>
        {pendingCount > 0 && (
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/20 border text-sm px-3 py-1">
            {pendingCount} معلق
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={view === "pending" ? "default" : "outline"} onClick={() => setView("pending")}>
          النزاعات المعلقة
          <Badge variant="secondary" className="mr-2">{pendingCount}</Badge>
        </Button>
        <Button variant={view === "history" ? "default" : "outline"} onClick={() => setView("history")}>
          سجل المعالجة
          <Badge variant="secondary" className="mr-2">{history.length}</Badge>
        </Button>
      </div>

      {view === "pending" ? (
        <>
          <div className="flex flex-wrap items-center gap-3 bg-card p-4 rounded-lg border border-border">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="بحث بالتعليق أو الولاية..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="pending">معلق</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground ml-auto">{filtered.length} نتيجة</span>
          </div>

          <div className="border rounded-md overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>معرّف السائق</TableHead>
                  <TableHead>التقييم</TableHead>
                  <TableHead>الولاية</TableHead>
                  <TableHead className="w-[30%]">الرسالة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead className="text-right">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array(6).fill(0).map((_, i) => (
                    <TableRow key={i}>{Array(7).fill(0).map((__, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                      <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium text-foreground">لا توجد نزاعات معلقة</p>
                      <p className="text-sm mt-1">جرّب تغيير خيارات البحث أو التصفية.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((dispute) => (
                    <TableRow key={dispute.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {dispute.driver_id?.slice(0, 12) ?? "—"}…
                      </TableCell>
                      <TableCell><StarRating rating={dispute.rating} /></TableCell>
                      <TableCell className="text-sm">{dispute.wilaya || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dispute.comment
                          ? <span className="line-clamp-2">{dispute.comment}</span>
                          : <span className="italic opacity-50">لا توجد رسالة</span>
                        }
                      </TableCell>
                      <TableCell>
                        <Select value={dispute.status} onValueChange={(v) => handleStatusChange(dispute.id, v as DisputeStatus)}>
                          <SelectTrigger className="h-8 w-[150px] text-xs">
                            <Badge variant="outline" className={STATUS_STYLES[dispute.status]}>{STATUS_LABELS[dispute.status]}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">معلق</SelectItem>
                            <SelectItem value="resolved">تمت المعالجة</SelectItem>
                            <SelectItem value="dismissed">مغلق</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(dispute.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelected(dispute)}>
                          <Eye className="w-4 h-4" /> عرض
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 bg-card p-4 rounded-lg border border-border">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="بحث بالتعليق أو الولاية أو الأدمن..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <span className="text-sm text-muted-foreground ml-auto">{filteredHistory.length} نتيجة</span>
          </div>

          <div className="border rounded-md overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>معرّف السائق</TableHead>
                  <TableHead>التقييم</TableHead>
                  <TableHead>الرسالة</TableHead>
                  <TableHead>القرار</TableHead>
                  <TableHead>الأدمن</TableHead>
                  <TableHead>تاريخ المعالجة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLoading ? (
                  Array(6).fill(0).map((_, i) => (
                    <TableRow key={i}>{Array(6).fill(0).map((__, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : filteredHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                      <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium text-foreground">لا يوجد سجل معالجة بعد</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {entry.driverId?.slice(0, 12) ?? "—"}…
                      </TableCell>
                      <TableCell><StarRating rating={entry.rating} /></TableCell>
                      <TableCell className="max-w-[30%] text-sm text-muted-foreground">
                        {entry.comment ?? <span className="italic opacity-50">لا توجد رسالة</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_STYLES[entry.status]}>
                          {STATUS_LABELS[entry.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{entry.adminEmail ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(entry.resolvedAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>تفاصيل الشكوى</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted-foreground text-xs mb-1">معرّف السائق</p><p className="font-mono text-xs">{selected.driver_id?.slice(0, 20) ?? "—"}</p></div>
                <div><p className="text-muted-foreground text-xs mb-1">الولاية</p><p>{selected.wilaya ?? "—"}</p></div>
                <div><p className="text-muted-foreground text-xs mb-1">التاريخ</p><p>{formatDate(selected.created_at)}</p></div>
                <div><p className="text-muted-foreground text-xs mb-1">التقييم</p><StarRating rating={selected.rating} /></div>
                <div className="col-span-2"><p className="text-muted-foreground text-xs mb-1">الحالة</p>
                  <Badge variant="outline" className={STATUS_STYLES[selected.status]}>{STATUS_LABELS[selected.status]}</Badge>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-1">الرسالة / التعليق</p>
                <div className="bg-muted/40 rounded-md p-3 text-sm leading-relaxed min-h-[80px]">
                  {selected.comment ?? <span className="italic opacity-50">لا توجد رسالة</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-sm text-muted-foreground">تغيير الحالة:</span>
                <Select value={selected.status} onValueChange={(v) => handleStatusChange(selected.id, v as DisputeStatus)}>
                  <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">معلق</SelectItem>
                    <SelectItem value="resolved">تمت المعالجة</SelectItem>
                    <SelectItem value="dismissed">مغلق</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
