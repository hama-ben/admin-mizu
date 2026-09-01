import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Clock3, MapPin, PackageX, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { ALGERIAN_WILAYAS, formatDate } from "@/lib/constants";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ExpiredOrder {
  id: string;
  userId: string;
  customer: {
    name: string | null;
    phone: string | null;
    commune: string | null;
    wilaya: string | null;
  };
  createdAt: string;
  expiresAt: string;
}

interface MunicipalitySummary {
  commune: string;
  wilaya: string;
  orderCount: number;
}

interface ExpiredOrdersResponse {
  data: ExpiredOrder[];
  count: number;
  page: number;
  pageSize: number;
  topMunicipalities: MunicipalitySummary[];
}

export default function ExpiredOrdersPage() {
  const [orders, setOrders] = useState<ExpiredOrder[]>([]);
  const [topMunicipalities, setTopMunicipalities] = useState<MunicipalitySummary[]>([]);
  const [wilaya, setWilaya] = useState("all");
  const [commune, setCommune] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  async function loadExpiredOrders(background = false) {
    if (!background) setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "25",
      });
      if (wilaya !== "all") params.set("wilaya", wilaya);
      if (commune.trim()) params.set("commune", commune.trim());
      const result = await api.get<ExpiredOrdersResponse>(`/expired-orders?${params.toString()}`);
      setOrders(result.data ?? []);
      setTotalCount(result.count ?? 0);
      setTopMunicipalities(result.topMunicipalities ?? []);
    } catch (error: any) {
      if (!background) {
        toast({
          title: "تعذر جلب الطلبات المنتهية",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => loadExpiredOrders(), 250);
    return () => clearTimeout(timer);
  }, [wilaya, commune, page]);
  useAutoRefresh(() => loadExpiredOrders(true), 10000);

  function changeWilaya(value: string) {
    setWilaya(value);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / 25));

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <PackageX className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">الطلبات المنتهية</h1>
          </div>
          <p className="mt-2 text-muted-foreground">
            الطلبات التي انتهت بعد مؤقت الـ12 ساعة في تطبيق Mizu.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => loadExpiredOrders()}
          disabled={loading}
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          تحديث
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">إجمالي الطلبات المنتهية</p>
              {loading ? <Skeleton className="mt-2 h-9 w-24" /> : <p className="mt-2 text-3xl font-bold">{totalCount}</p>}
            </div>
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <PackageX className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">نطاق التحليل الجغرافي</p>
              <p className="mt-2 text-lg font-semibold">آخر 30 يوماً</p>
              <p className="mt-1 text-xs text-muted-foreground">حسب تاريخ إنشاء الطلب</p>
            </div>
            <div className="rounded-full bg-amber-500/10 p-3 text-amber-400">
              <MapPin className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>أعلى 10 بلديات من حيث الطلبات المنتهية</CardTitle>
        </CardHeader>
        <CardContent className="h-[330px]">
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : topMunicipalities.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              لا توجد طلبات منتهية خلال آخر 30 يوماً.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topMunicipalities}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 24, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  type="category"
                  dataKey="commune"
                  width={110}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number) => [value, "طلبات منتهية"]}
                  labelFormatter={(label) => {
                    const item = topMunicipalities.find((municipality) => municipality.commune === label);
                    return item ? `${label} — ${item.wilaya}` : label;
                  }}
                />
                <Bar dataKey="orderCount" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">قائمة الطلبات المنتهية</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            مصدر القائمة هو `orders.status = منتهي الصلاحية`، وتاريخ الانتهاء محسوب من تاريخ الإنشاء + 12 ساعة.
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap gap-3">
              <Select value={wilaya} onValueChange={changeWilaya}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="كل الولايات" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الولايات</SelectItem>
                  {ALGERIAN_WILAYAS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={commune}
                  onChange={(event) => {
                    setCommune(event.target.value);
                    setPage(0);
                  }}
                  placeholder="ابحث بالبلدية…"
                  className="pr-9"
                />
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>المستهلك</TableHead>
                    <TableHead>البلدية</TableHead>
                    <TableHead>الولاية</TableHead>
                    <TableHead>تاريخ الإنشاء</TableHead>
                    <TableHead>تاريخ الانتهاء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <TableRow key={index}>
                        {Array.from({ length: 5 }).map((__, cell) => (
                          <TableCell key={cell}><Skeleton className="h-5 w-24" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                        لا توجد طلبات منتهية تطابق الفلاتر الحالية.
                      </TableCell>
                    </TableRow>
                  ) : orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div className="font-medium">{order.customer.name || order.userId}</div>
                        <div className="text-xs text-muted-foreground">{order.customer.phone || "—"}</div>
                      </TableCell>
                      <TableCell>{order.customer.commune || "—"}</TableCell>
                      <TableCell>{order.customer.wilaya || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className="gap-1 border-red-500/30 text-red-400">
                          <Clock3 className="h-3.5 w-3.5" /> {formatDate(order.expiresAt)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>عرض {orders.length ? page * 25 + 1 : 0}–{Math.min((page + 1) * 25, totalCount)} من أصل {totalCount}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page === 0 || loading}
                >
                  السابق
                </Button>
                <span>صفحة {page + 1} من {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                  disabled={page >= totalPages - 1 || loading}
                >
                  التالي
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}