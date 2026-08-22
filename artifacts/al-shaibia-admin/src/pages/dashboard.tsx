import { useEffect, useRef, useState } from "react";
import { supabase, USER_TYPE_DRIVER, USER_TYPE_CONSUMER } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDZD } from "@/lib/constants";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Users, Truck, Package, CreditCard, Activity, Clock, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

interface Stats {
  totalDrivers: number;
  activeDrivers: number;
  pendingVerifications: number;
  totalConsumers: number;
  ordersCompleted: number;
  totalRevenue: number;
}

async function safeCount(query: any): Promise<number> {
  const { count, error } = await query;
  if (error) console.error("count query error:", error.message);
  return count ?? 0;
}

type ChartMetric = "orders" | "consumers" | "drivers";

interface ChartPoint {
  date: string;
  orders: number;
  consumers: number;
  drivers: number;
}

async function loadDashboardData(): Promise<{ stats: Stats; chartData: ChartPoint[] }> {
  const [
    totalDrivers,
    pendingVerifications,
    activeDrivers,
    totalConsumers,
    ordersCompleted,
  ] = await Promise.all([
    safeCount(supabase.from("users").select("*", { count: "exact", head: true }).eq("user_type", USER_TYPE_DRIVER)),
    safeCount(supabase.from("users").select("*", { count: "exact", head: true }).eq("user_type", USER_TYPE_DRIVER).eq("account_status", "pending")),
    safeCount(supabase.from("driver_status").select("*", { count: "exact", head: true }).eq("current_status", "online")),
    safeCount(supabase.from("users").select("*", { count: "exact", head: true }).eq("user_type", USER_TYPE_CONSUMER)),
    safeCount(supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "تم التوصيل")),
  ]);

  const { data: completedOrders } = await supabase
    .from("orders")
    .select("total_price")
    .eq("status", "تم التوصيل");
  const totalRevenue = (completedOrders ?? []).reduce((s, o) => s + Number(o.total_price), 0);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: recentOrders }, { data: recentDrivers }, { data: recentConsumers }] = await Promise.all([
    supabase.from("orders").select("created_at").gte("created_at", since),
    supabase.from("users").select("created_at").eq("user_type", USER_TYPE_DRIVER).gte("created_at", since),
    supabase.from("users").select("created_at").eq("user_type", USER_TYPE_CONSUMER).gte("created_at", since),
  ]);

  const dailyMap = new Map<string, ChartPoint>();
  function ensureDay(d: string): ChartPoint {
    let point = dailyMap.get(d);
    if (!point) {
      point = { date: d, orders: 0, consumers: 0, drivers: 0 };
      dailyMap.set(d, point);
    }
    return point;
  }
  (recentOrders ?? []).forEach((o) => { ensureDay(o.created_at.slice(0, 10)).orders += 1; });
  (recentDrivers ?? []).forEach((u) => { ensureDay(u.created_at.slice(0, 10)).drivers += 1; });
  (recentConsumers ?? []).forEach((u) => { ensureDay(u.created_at.slice(0, 10)).consumers += 1; });

  const chartData = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return { stats: { totalDrivers, activeDrivers, pendingVerifications, totalConsumers, ordersCompleted, totalRevenue }, chartData };
}

const METRIC_LABELS: Record<ChartMetric, string> = {
  orders: "الطلبات",
  consumers: "المستهلكون الجدد",
  drivers: "السائقون الجدد",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [metric, setMetric] = useState<ChartMetric>("orders");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const initializedRef = useRef(false);

  async function fetchAll(isBackground = false) {
    if (!isBackground) setLoading(true);
    try {
      const result = await loadDashboardData();
      setStats(result.stats);
      setChartData(result.chartData);
      setLastUpdated(new Date());
    } catch (err: any) {
      if (!isBackground) console.error("Dashboard fetch error:", err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll(false);
    initializedRef.current = true;
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => fetchAll(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => fetchAll(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useAutoRefresh(() => fetchAll(true));

  function formatLastUpdated(d: Date): string {
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "للتو";
    if (diffMins === 1) return "منذ دقيقة";
    if (diffMins < 60) return `منذ ${diffMins} دقائق`;
    const diffHours = Math.floor(diffMins / 60);
    return `منذ ${diffHours} ساعة`;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">لوحة التحكم</h1>
          <p className="text-muted-foreground mt-2">إحصائيات المنصة المباشرة.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              آخر تحديث: {formatLastUpdated(lastUpdated)}
            </span>
          )}
          <button
            onClick={() => fetchAll(false)}
            disabled={loading}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="تحديث يدوي"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array(6).fill(0).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-4 w-24 mb-4" /><Skeleton className="h-8 w-20" /></CardContent></Card>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard title="إجمالي الإيرادات" value={formatDZD(stats.totalRevenue ?? 0)} icon={CreditCard} />
          <StatCard title="السائقون النشطون" value={String(stats.activeDrivers ?? 0)} icon={Activity} />
          <StatCard title="بانتظار المراجعة" value={String(stats.pendingVerifications ?? 0)} icon={Clock} valueClass="text-amber-500" />
          <StatCard title="الطلبات المكتملة" value={String(stats.ordersCompleted ?? 0)} icon={Package} />
          <StatCard title="إجمالي السائقين" value={String(stats.totalDrivers ?? 0)} icon={Truck} />
          <StatCard title="إجمالي المستهلكين" value={String(stats.totalConsumers ?? 0)} icon={Users} />
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between gap-4 space-y-0">
          <CardTitle>{METRIC_LABELS[metric]} — آخر 30 يوم</CardTitle>
          <div className="flex gap-1 bg-muted rounded-md p-1">
            {(Object.keys(METRIC_LABELS) as ChartMetric[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  metric === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {METRIC_LABELS[m]}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="h-[380px]">
          {loading ? (
            <Skeleton className="w-full h-full" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }}
                  tickLine={false} axisLine={false} dy={10}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} dx={-10} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                  labelFormatter={(l) => `التاريخ: ${l}`}
                  formatter={(v: number) => [v, METRIC_LABELS[metric]]}
                />
                <Area type="monotone" dataKey={metric} stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#grad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              لا توجد بيانات خلال آخر 30 يوماً.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, className = "", valueClass = "" }: {
  title: string; value: string; icon: any; className?: string; valueClass?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={`text-3xl font-bold mt-2 ${valueClass}`}>{value}</p>
        </div>
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-6 h-6 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}
