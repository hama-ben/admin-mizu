import { useEffect, useRef, useState } from "react";
import { supabase, type Order, type User } from "@/lib/supabase";
import { formatDZD, formatDate } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { StatusLegend } from "@/components/status-legend";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const ORDER_STATUSES = ["معلق", "قيد التوصيل", "وصل السائق", "تم التوصيل"];

const STATUS_STYLES: Record<string, string> = {
  "معلق":          "bg-amber-500/20 text-amber-500 border-amber-500/20",
  "قيد التوصيل":   "bg-blue-500/20 text-blue-400 border-blue-500/20",
  "وصل السائق":   "bg-purple-500/20 text-purple-400 border-purple-500/20",
  "تم التوصيل":   "bg-green-500/20 text-green-500 border-green-500/20",
};

interface EnrichedOrder extends Order {
  customerUser?: Pick<User, "id" | "name" | "phone"> | null;
  driverUser?: Pick<User, "id" | "name" | "phone"> | null;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<EnrichedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();
  const PAGE_SIZE = 20;

  const filtersRef = useRef({ statusFilter, dateFrom, dateTo, page });
  filtersRef.current = { statusFilter, dateFrom, dateTo, page };

  useEffect(() => { setPage(0); }, [statusFilter, dateFrom, dateTo]);
  useEffect(() => { fetchOrders(false); }, [statusFilter, dateFrom, dateTo, page]);

  useAutoRefresh(() => fetchOrders(true));

  async function fetchOrders(isBackground = false) {
    const { statusFilter, dateFrom, dateTo, page } = filtersRef.current;
    if (!isBackground) setLoading(true);
    try {
      let query = supabase.from("orders").select("*", { count: "exact" });
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (dateFrom) query = query.gte("created_at", new Date(dateFrom).toISOString());
      if (dateTo) {
        const to = new Date(dateTo); to.setDate(to.getDate() + 1);
        query = query.lte("created_at", to.toISOString());
      }
      query = query.order("created_at", { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data: rawOrders, count, error } = await query;
      if (error) throw error;
      if (count !== null) setTotalCount(count);

      if (!rawOrders || rawOrders.length === 0) { setOrders([]); return; }

      const customerIds = [...new Set(rawOrders.map((o: Order) => o.user_id).filter(Boolean))];
      const driverIds = [...new Set(rawOrders.map((o: Order) => o.driver_id).filter(Boolean))] as string[];
      const allIds = [...new Set([...customerIds, ...driverIds])];

      let usersMap = new Map<string, Pick<User, "id" | "name" | "phone">>();
      if (allIds.length > 0) {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, name, phone")
          .in("id", allIds);
        (usersData ?? []).forEach((u: any) => usersMap.set(u.id, u));
      }

      setOrders(rawOrders.map((o: Order) => ({
        ...o,
        customerUser: usersMap.get(o.user_id) ?? null,
        driverUser: o.driver_id ? usersMap.get(o.driver_id) ?? null : null,
      })));
    } catch (err: any) {
      if (!isBackground) {
        toast({ title: "تعذر جلب الطلبات", description: err.message, variant: "destructive" });
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  function handleExportCSV() {
    const headers = ["رقم الطلب", "العميل", "هاتف العميل", "السائق", "هاتف السائق", "الحجم", "البراميل", "السعر (دج)", "الحالة", "التاريخ"];
    const rows = orders.map((o) => [
      o.id,
      `"${o.customerUser?.name || o.user_id}"`,
      o.customerUser?.phone || "",
      `"${o.driverUser?.name || o.driver_id || "غير معيّن"}"`,
      o.driverUser?.phone || "",
      `"${o.water_volume}"`,
      o.barrel_count,
      o.total_price,
      `"${o.status}"`,
      formatDate(o.created_at),
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `orders_${new Date().toISOString().split("T")[0]}.csv`;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleExportPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("الشعبية — تقرير الطلبات", 14, 15);
    doc.setFontSize(9);
    doc.text(`تاريخ الإنشاء: ${new Date().toLocaleString("ar-DZ")}`, 14, 21);

    autoTable(doc, {
      startY: 26,
      head: [["رقم الطلب", "العميل", "هاتف العميل", "السائق", "هاتف السائق", "الحجم", "البراميل", "السعر (دج)", "الحالة", "التاريخ"]],
      body: orders.map((o) => [
        o.id.slice(0, 8),
        o.customerUser?.name || o.user_id,
        o.customerUser?.phone || "",
        o.driverUser?.name || o.driver_id || "غير معيّن",
        o.driverUser?.phone || "",
        String(o.water_volume),
        String(o.barrel_count),
        String(o.total_price),
        o.status,
        formatDate(o.created_at),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    doc.save(`orders_${new Date().toISOString().split("T")[0]}.pdf`);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الطلبات</h1>
          <p className="text-muted-foreground mt-2">السجل الكامل لجميع طلبات المنصة.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportCSV} variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> تصدير CSV
          </Button>
          <Button onClick={handleExportPDF} variant="outline" className="gap-2">
            <FileText className="w-4 h-4" /> تصدير PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 flex-wrap bg-card p-4 rounded-lg border">
        <div className="space-y-1">
           <label className="text-xs text-muted-foreground font-medium">الحالة</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
           <SelectTrigger className="w-[220px]"><SelectValue placeholder="جميع الحالات" /></SelectTrigger>
            <SelectContent>
             <SelectItem value="all">جميع الحالات</SelectItem>
              {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
        </div>
      </div>

      <StatusLegend variant="orders" />
      <div className="border rounded-md overflow-hidden bg-card flex-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>رقم الطلب</TableHead>
              <TableHead>العميل</TableHead>
              <TableHead>السائق</TableHead>
              <TableHead>التفاصيل</TableHead>
              <TableHead>السعر</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>التاريخ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array(10).fill(0).map((_, i) => (
                <TableRow key={i}>{Array(7).fill(0).map((__, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">لم يتم العثور على طلبات.</TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{order.id.slice(0, 8)}…</TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{order.customerUser?.name || "—"}</div>
                    {order.customerUser?.phone && <div className="text-xs text-muted-foreground">{order.customerUser.phone}</div>}
                  </TableCell>
                  <TableCell>
                    {order.driverUser ? (
                      <div>
                        <div className="font-medium text-sm">{order.driverUser.name}</div>
                        {order.driverUser.phone && <div className="text-xs text-muted-foreground">{order.driverUser.phone}</div>}
                      </div>
                    ) : (
                       <span className="italic text-muted-foreground text-sm">غير معيّن</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{order.water_volume}</div>
                     <div className="text-xs text-muted-foreground">{order.barrel_count} برميل</div>
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{formatDZD(order.total_price)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLES[order.status] || ""}>{order.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(order.created_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
           عرض {orders.length > 0 ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} من أصل {totalCount} طلب
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
