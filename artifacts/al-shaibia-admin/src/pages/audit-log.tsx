import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/constants";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

interface AuditLogEntry {
  id: string;
  admin_user_id: string | null;
  admin_email: string | null;
  action_type: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_STYLES: Record<string, string> = {
  approve: "bg-green-500/20 text-green-500 border-green-500/20",
  reject: "bg-red-500/20 text-red-400 border-red-500/20",
  suspend: "bg-amber-500/20 text-amber-500 border-amber-500/20",
  unsuspend: "bg-blue-500/20 text-blue-400 border-blue-500/20",
  ban: "bg-red-500/20 text-red-400 border-red-500/20",
  unban: "bg-blue-500/20 text-blue-400 border-blue-500/20",
  resolve: "bg-green-500/20 text-green-500 border-green-500/20",
  create: "bg-blue-500/20 text-blue-400 border-blue-500/20",
};

const ACTION_LABELS: Record<string, string> = {
  approve: "موافقة",
  reject: "رفض",
  suspend: "إيقاف",
  unsuspend: "إلغاء الإيقاف",
  ban: "حظر",
  unban: "إلغاء الحظر",
  resolve: "حلّ",
  create: "إنشاء",
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();
  const PAGE_SIZE = 25;

  const pageRef = useRef(page);
  pageRef.current = page;

  async function fetchAuditLog(isBackground = false) {
    if (!isBackground) setLoading(true);
    try {
      const { data, count } = await api.get<{ data: AuditLogEntry[]; count: number }>(
        `/audit-log?page=${pageRef.current}&pageSize=${PAGE_SIZE}`,
      );
      setEntries(data);
      setTotalCount(count);
    } catch (err: any) {
      if (!isBackground) {
        toast({ title: "تعذر جلب سجل الإجراءات", description: err.message, variant: "destructive" });
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  useEffect(() => { fetchAuditLog(false); }, [page]);
  useAutoRefresh(() => fetchAuditLog(true));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500 flex flex-col h-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">سجل الإجراءات</h1>
        <p className="text-muted-foreground mt-2">
           يعرض كل إجراء إداري ومنفّذه وتاريخ تنفيذه.
        </p>
      </div>

      <div className="border rounded-md overflow-hidden bg-card flex-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
               <TableHead>المدير</TableHead>
               <TableHead>الإجراء</TableHead>
               <TableHead>الهدف</TableHead>
               <TableHead>التفاصيل</TableHead>
               <TableHead>التاريخ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array(10).fill(0).map((_, i) => (
                <TableRow key={i}>{Array(5).fill(0).map((__, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                  <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                   لا توجد إجراءات إدارية مسجلة بعد.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm">{entry.admin_email || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ACTION_STYLES[entry.action_type] || ""}>
                       {ACTION_LABELS[entry.action_type] ?? entry.action_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{entry.target_type}</div>
                    {entry.target_id && (
                      <div className="text-xs text-muted-foreground font-mono">{entry.target_id.slice(0, 8)}…</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[320px] truncate">
                    {entry.details ? JSON.stringify(entry.details) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(entry.created_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
           عرض {entries.length > 0 ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} من أصل {totalCount} إجراء
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}>
            <ChevronRight className="w-4 h-4 ml-1" /> السابق
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE_SIZE >= totalCount || loading}>
            التالي <ChevronLeft className="w-4 h-4 mr-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
