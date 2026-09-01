import { useEffect, useState } from "react";
import { Award, Clock3, RefreshCw, Share2, Star, Truck } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/constants";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DriverAward {
  id: string;
  monthStart: string;
  monthEnd: string;
  wilaya: string;
  commune: string;
  driver: {
    id: string;
    name: string | null;
    phone: string | null;
  };
  completedDeliveries: number;
  averageStars: number;
  averageDeliverySeconds: number;
}

interface MotivationResponse {
  awards: DriverAward[];
  awardsCount: number;
  page: number;
  pageSize: number;
  socialShare: {
    monthStart: string;
    total: number;
    qualified: number;
  };
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} س و${remainingMinutes} د` : `${hours} ساعة`;
}

export default function MotivationPage() {
  const [data, setData] = useState<MotivationResponse | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  async function load(background = false) {
    if (!background) setLoading(true);
    try {
      const result = await api.get<MotivationResponse>(`/motivation/overview?page=${page}&pageSize=20`);
      setData(result);
    } catch (error: any) {
      if (!background) {
        toast({
          title: "تعذر جلب بيانات التحفيز",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page]);
  useAutoRefresh(() => load(true), 10000);

  const awards = data?.awards ?? [];
  const social = data?.socialShare ?? { total: 0, qualified: 0, monthStart: "" };
  const totalPages = Math.max(1, Math.ceil((data?.awardsCount ?? 0) / 20));

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            <Award className="h-7 w-7 text-primary" /> نظرة التحفيز
          </h1>
          <p className="mt-2 text-muted-foreground">
            متابعة سجل سائق الشهر وأداء المشاركة الاجتماعية.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => load()} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> تحديث
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">سجلات سائق الشهر</p>
              {loading ? <Skeleton className="mt-2 h-9 w-16" /> : <p className="mt-2 text-3xl font-bold">{data?.awardsCount ?? 0}</p>}
            </div>
            <Award className="h-7 w-7 text-amber-400" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">إحالات المشاركة الاجتماعية هذا الشهر</p>
              {loading ? <Skeleton className="mt-2 h-9 w-16" /> : <p className="mt-2 text-3xl font-bold">{social.total}</p>}
            </div>
            <Share2 className="h-7 w-7 text-blue-400" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">المؤهل منها فعلياً</p>
              {loading ? <Skeleton className="mt-2 h-9 w-16" /> : <p className="mt-2 text-3xl font-bold">{social.qualified}</p>}
              <p className="mt-1 text-xs text-muted-foreground">حالة referral = qualified</p>
            </div>
            <Truck className="h-7 w-7 text-emerald-400" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>سجل سائق الشهر</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>الشهر</TableHead>
                  <TableHead>البلدية / الولاية</TableHead>
                  <TableHead>السائق الفائز</TableHead>
                  <TableHead>التوصيلات</TableHead>
                  <TableHead>متوسط التقييم</TableHead>
                  <TableHead>متوسط زمن التوصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      {Array.from({ length: 6 }).map((__, cell) => (
                        <TableCell key={cell}><Skeleton className="h-5 w-24" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : awards.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      لا توجد سجلات لسائق الشهر بعد.
                    </TableCell>
                  </TableRow>
                ) : awards.map((award) => (
                  <TableRow key={award.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium">{formatDate(award.monthStart)}</div>
                      <div className="text-xs text-muted-foreground">حتى {formatDate(award.monthEnd)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{award.commune}</div>
                      <div className="text-xs text-muted-foreground">{award.wilaya}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{award.driver.name || award.driver.id}</div>
                      <div className="text-xs text-muted-foreground">{award.driver.phone || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <Truck className="h-3.5 w-3.5" /> {award.completedDeliveries}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {award.averageStars.toFixed(1)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatDuration(award.averageDeliverySeconds)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>عرض {awards.length ? page * 20 + 1 : 0}–{Math.min((page + 1) * 20, data?.awardsCount ?? 0)} من أصل {data?.awardsCount ?? 0}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0 || loading}>
                السابق
              </Button>
              <span>صفحة {page + 1} من {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} disabled={page >= totalPages - 1 || loading}>
                التالي
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}