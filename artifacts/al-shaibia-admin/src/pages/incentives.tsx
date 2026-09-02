import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CircleDollarSign,
  Clock3,
  Gift,
  Percent,
  RefreshCw,
  Search,
  Send,
  TicketPercent,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatDZD } from "@/lib/constants";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type CouponStatus = "pending_activation" | "active" | "used" | "expired";

interface SpinDistribution {
  key: string;
  resultPercentage: number | null;
  label: string;
  designedPercentage: number;
  actualCount: number;
  actualPercentage: number;
  deltaPercentage: number;
}

interface CouponCostBreakdown {
  discountPercentage: number | null;
  amountDzd: number;
  usedCount: number;
  missingAppliedAmountCount: number;
  capDzd: number | null;
}

interface IncentiveSummary {
  totalSpins: number;
  distribution: SpinDistribution[];
  couponCost: {
    monthlyCostDzd: number;
    monthlyUsedCoupons: number;
    missingAppliedAmountCount: number;
    byPercentage: CouponCostBreakdown[];
  };
}

interface Coupon {
  id: string;
  userId: string;
  discountPercentage: number;
  maxDiscountAmount: number | null;
  appliedAmountDzd: number | null;
  wonAt: string;
  activationTriggerAt: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  appliedToPaymentId: string | null;
  status: CouponStatus;
  owner: { name: string | null; phone: string | null };
}

interface CouponResponse {
  data: Coupon[];
  count: number;
  page: number;
  pageSize: number;
}

interface GiftUser {
  id: string;
  name: string;
  phone: string | null;
  userType: string;
}

interface GiftCouponType {
  id: string;
  discountPercentage: number;
  maxDiscountAmount: number | null;
}

const STATUS_LABELS: Record<CouponStatus, string> = {
  pending_activation: "بانتظار التفعيل",
  active: "نشطة",
  used: "مستخدمة",
  expired: "منتهية",
};

const STATUS_STYLES: Record<CouponStatus, string> = {
  pending_activation: "border-amber-500/30 text-amber-400",
  active: "border-blue-500/30 text-blue-400",
  used: "border-emerald-500/30 text-emerald-400",
  expired: "border-red-500/30 text-red-400",
};

function dateLabel(value: string | null) {
  return value ? formatDate(value) : "—";
}

function percentageLabel(value: number | null) {
  return value === null ? "إعادة لفة" : `${value}%`;
}

function signedPercentage(value: number) {
  if (value === 0) return "0 نقطة";
  return `${value > 0 ? "+" : ""}${value} نقطة`;
}

export default function IncentivesPage() {
  const [summary, setSummary] = useState<IncentiveSummary | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponCount, setCouponCount] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [discount, setDiscount] = useState("all");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [couponsLoading, setCouponsLoading] = useState(true);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftUsers, setGiftUsers] = useState<GiftUser[]>([]);
  const [giftCouponTypes, setGiftCouponTypes] = useState<GiftCouponType[]>([]);
  const [giftUsersLoading, setGiftUsersLoading] = useState(false);
  const [giftOptionsLoading, setGiftOptionsLoading] = useState(false);
  const [giftSubmitting, setGiftSubmitting] = useState(false);
  const [giftUserSearch, setGiftUserSearch] = useState("");
  const [selectedGiftUser, setSelectedGiftUser] = useState("");
  const [giftType, setGiftType] = useState<"spins" | "coupon">("spins");
  const [giftQuantity, setGiftQuantity] = useState("1");
  const [selectedCouponTemplate, setSelectedCouponTemplate] = useState("");
  const { toast } = useToast();

  async function loadSummary(background = false) {
    if (!background) setLoading(true);
    try {
      setSummary(await api.get<IncentiveSummary>("/incentives/summary"));
    } catch (error: any) {
      if (!background) {
        toast({
          title: "تعذر جلب إحصائيات العجلة والقسائم",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      if (!background) setLoading(false);
    }
  }

  async function loadCoupons(background = false) {
    if (!background) setCouponsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "25",
      });
      if (search.trim()) params.set("search", search.trim());
      if (status !== "all") params.set("status", status);
      if (discount !== "all") params.set("discount", discount);
      const result = await api.get<CouponResponse>(`/incentives/coupons?${params.toString()}`);
      setCoupons(result.data ?? []);
      setCouponCount(result.count ?? 0);
    } catch (error: any) {
      if (!background) {
        toast({
          title: "تعذر جلب القسائم",
          description: error.message,
          variant: "destructive",
        });
      }
    } finally {
      if (!background) setCouponsLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);
  useAutoRefresh(() => loadSummary(true), 10000);

  useEffect(() => {
    const timer = setTimeout(() => loadCoupons(), 250);
    return () => clearTimeout(timer);
  }, [search, status, discount, page]);
  useAutoRefresh(() => loadCoupons(true), 10000);

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(0);
  }

  async function openGiftDialog() {
    setGiftOpen(true);
    setGiftUsersLoading(true);
    setGiftOptionsLoading(true);
    try {
      const [usersResult, couponTypesResult] = await Promise.all([
        api.get<{ data: GiftUser[] }>("/incentives/gift-users"),
        api.get<{ data: GiftCouponType[] }>("/incentives/gift-coupon-types"),
      ]);
      setGiftUsers(usersResult.data ?? []);
      setGiftCouponTypes(couponTypesResult.data ?? []);
    } catch (error: any) {
      toast({
        title: "تعذر تحميل قائمة الإهداء",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGiftUsersLoading(false);
      setGiftOptionsLoading(false);
    }
  }

  async function submitGift() {
    const quantity = Number(giftQuantity);
    if (!selectedGiftUser || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      toast({
        title: "أكمل بيانات الإهداء",
        description: "اختر مستخدماً وأدخل عدداً صحيحاً بين 1 و1000.",
        variant: "destructive",
      });
      return;
    }
    if (giftType === "coupon" && !selectedCouponTemplate) {
      toast({
        title: "اختر القسيمة",
        description: "اختر نوع القسيمة التي تريد إرسالها.",
        variant: "destructive",
      });
      return;
    }

    setGiftSubmitting(true);
    try {
      await api.post("/incentives/gift", {
        userId: selectedGiftUser,
        giftType,
        quantity,
        couponTemplateId: giftType === "coupon" ? selectedCouponTemplate : undefined,
      });
      const selectedUser = giftUsers.find((user) => user.id === selectedGiftUser);
      toast({
        title: "تم الإهداء بنجاح",
        description: `تم إرسال ${quantity} ${giftType === "spins" ? "لفة" : "قسيمة"} إلى ${selectedUser?.name ?? "المستخدم"}.`,
      });
      setGiftOpen(false);
      setGiftQuantity("1");
      setSelectedGiftUser("");
      setSelectedCouponTemplate("");
      loadSummary(true);
      loadCoupons(true);
    } catch (error: any) {
      toast({
        title: "تعذر إتمام الإهداء",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGiftSubmitting(false);
    }
  }

  const visibleGiftUsers = giftUsers.filter((user) => {
    const query = giftUserSearch.trim().toLocaleLowerCase();
    return !query || `${user.name} ${user.phone ?? ""}`.toLocaleLowerCase().includes(query);
  });
  const maxCouponPages = Math.max(1, Math.ceil(couponCount / 25));
  const totalSpins = summary?.totalSpins ?? 0;
  const monthlyCost = summary?.couponCost.monthlyCostDzd ?? 0;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Gift className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">عجلة الحظ والقسائم</h1>
          </div>
          <p className="mt-2 text-muted-foreground">
            راقب توزيع النتائج والتكلفة الفعلية للقسائم المستخدمة.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={openGiftDialog}>
            <Send className="h-4 w-4" />
            إهداء
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              loadSummary();
              loadCoupons();
            }}
            disabled={loading || couponsLoading}
          >
            <RefreshCw className={(loading || couponsLoading) ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            تحديث
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="العدد الكلي للفات"
          value={String(totalSpins)}
          icon={Activity}
          loading={loading}
        />
        <MetricCard
          title="تكلفة الخصومات هذا الشهر"
          value={formatDZD(monthlyCost)}
          icon={CircleDollarSign}
          loading={loading}
          valueClass="text-amber-400"
        />
        <MetricCard
          title="القسائم المستخدمة هذا الشهر"
          value={String(summary?.couponCost.monthlyUsedCoupons ?? 0)}
          icon={TicketPercent}
          loading={loading}
        />
        <MetricCard
          title="القيم الفعلية الناقصة"
          value={String(summary?.couponCost.missingAppliedAmountCount ?? 0)}
          icon={AlertTriangle}
          loading={loading}
          valueClass={(summary?.couponCost.missingAppliedAmountCount ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}
        />
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">توزيع نتائج العجلة</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            مقارنة النتائج الفعلية بالنسبة المصممة لرصد أي انحراف في العشوائية.
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>النتيجة</TableHead>
                  <TableHead>العدد</TableHead>
                  <TableHead>الفعلي</TableHead>
                  <TableHead>المصمم</TableHead>
                  <TableHead>الانحراف</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      {Array.from({ length: 5 }).map((__, cell) => (
                        <TableCell key={cell}><Skeleton className="h-5 w-20" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : summary?.distribution.length ? (
                  summary.distribution.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell className="font-medium">{item.label}</TableCell>
                      <TableCell>{item.actualCount}</TableCell>
                      <TableCell>
                        <div className="flex min-w-[150px] items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.min(100, item.actualPercentage)}%` }}
                            />
                          </div>
                          <span className="w-12 text-left text-xs">{item.actualPercentage}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.designedPercentage}%</TableCell>
                      <TableCell className={item.deltaPercentage > 0 ? "text-amber-400" : item.deltaPercentage < 0 ? "text-red-400" : "text-muted-foreground"}>
                        {signedPercentage(item.deltaPercentage)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      لا توجد لفات مسجلة بعد.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">التكلفة الفعلية للخصومات</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            المجموع مبني على `applied_amount_dzd` للقسائم المستخدمة فعلياً منذ بداية الشهر الحالي.
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>نسبة الخصم</TableHead>
                  <TableHead>عدد القسائم</TableHead>
                  <TableHead>القيمة الفعلية</TableHead>
                  <TableHead>السقف</TableHead>
                  <TableHead>ملاحظة البيانات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      {Array.from({ length: 5 }).map((__, cell) => (
                        <TableCell key={cell}><Skeleton className="h-5 w-20" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (summary?.couponCost.byPercentage ?? []).map((item) => (
                  <TableRow key={item.discountPercentage ?? "unknown"}>
                    <TableCell className="font-medium">{percentageLabel(item.discountPercentage)}</TableCell>
                    <TableCell>{item.usedCount}</TableCell>
                    <TableCell className="font-semibold">{formatDZD(item.amountDzd)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.capDzd === null ? "بلا سقف" : formatDZD(item.capDzd)}
                    </TableCell>
                    <TableCell>
                      {item.missingAppliedAmountCount > 0 ? (
                        <span className="text-xs text-red-400">
                          {item.missingAppliedAmountCount} بدون قيمة مطبقة
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-400">مكتملة</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">قائمة القسائم</h2>
          <p className="mt-1 text-sm text-muted-foreground">بحث بالاسم أو الهاتف، مع حالة مشتقة من تواريخ القسيمة.</p>
        </div>
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ابحث بالاسم أو الهاتف…"
                  className="pr-9"
                />
              </div>
              <Select value={status} onValueChange={(value) => updateFilter(setStatus, value)}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="pending_activation">بانتظار التفعيل</SelectItem>
                  <SelectItem value="active">نشطة</SelectItem>
                  <SelectItem value="used">مستخدمة</SelectItem>
                  <SelectItem value="expired">منتهية</SelectItem>
                </SelectContent>
              </Select>
              <Select value={discount} onValueChange={(value) => updateFilter(setDiscount, value)}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="النسبة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل النسب</SelectItem>
                  <SelectItem value="100">100%</SelectItem>
                  <SelectItem value="75">75%</SelectItem>
                  <SelectItem value="50">50%</SelectItem>
                  <SelectItem value="25">25%</SelectItem>
                  <SelectItem value="10">10%</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>صاحب القسيمة</TableHead>
                    <TableHead>النسبة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>القيمة الفعلية</TableHead>
                    <TableHead>تاريخ الفوز</TableHead>
                    <TableHead>تاريخ الانتهاء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {couponsLoading ? (
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={index}>
                        {Array.from({ length: 6 }).map((__, cell) => (
                          <TableCell key={cell}><Skeleton className="h-5 w-24" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : coupons.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        لا توجد قسائم تطابق الفلاتر الحالية.
                      </TableCell>
                    </TableRow>
                  ) : coupons.map((coupon) => (
                    <TableRow key={coupon.id}>
                      <TableCell>
                        <div className="font-medium">{coupon.owner.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{coupon.owner.phone || "—"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <Percent className="h-3 w-3" /> {coupon.discountPercentage}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_STYLES[coupon.status]}>
                          {STATUS_LABELS[coupon.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{coupon.appliedAmountDzd === null ? "—" : formatDZD(coupon.appliedAmountDzd)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{dateLabel(coupon.wonAt)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" /> {dateLabel(coupon.expiresAt)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>إجمالي القسائم المطابقة: {couponCount}</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page === 0 || couponsLoading}
                >
                  السابق
                </Button>
                <span>صفحة {page + 1} من {maxCouponPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(maxCouponPages - 1, current + 1))}
                  disabled={page >= maxCouponPages - 1 || couponsLoading}
                >
                  التالي
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Dialog open={giftOpen} onOpenChange={setGiftOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              إهداء لفات أو قسائم
            </DialogTitle>
            <DialogDescription>
              اختر المستخدم ثم حدد نوع الهدية والعدد المراد إرساله.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="gift-user-search">المستخدمون (السائقون والمستهلكون)</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="gift-user-search"
                  value={giftUserSearch}
                  onChange={(event) => setGiftUserSearch(event.target.value)}
                  placeholder="ابحث بالاسم أو الهاتف…"
                  className="pr-9"
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border">
                {giftUsersLoading ? (
                  <div className="space-y-3 p-4">
                    {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
                  </div>
                ) : visibleGiftUsers.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">لا يوجد مستخدمون مطابقون.</p>
                ) : (
                  <RadioGroup value={selectedGiftUser} onValueChange={setSelectedGiftUser} className="gap-0">
                    {visibleGiftUsers.map((user) => (
                      <Label
                        key={user.id}
                        htmlFor={`gift-user-${user.id}`}
                        className="flex cursor-pointer items-center gap-3 border-b p-3 last:border-b-0 hover:bg-muted/40"
                      >
                        <RadioGroupItem value={user.id} id={`gift-user-${user.id}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{user.name || "بدون اسم"}</span>
                          <span className="block text-xs text-muted-foreground">{user.phone || "بدون هاتف"}</span>
                        </span>
                        <Badge variant="outline" className={user.userType === "سائق" ? "text-blue-400" : "text-purple-400"}>
                          {user.userType}
                        </Badge>
                      </Label>
                    ))}
                  </RadioGroup>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>نوع الإهداء</Label>
                <RadioGroup
                  value={giftType}
                  onValueChange={(value) => setGiftType(value as "spins" | "coupon")}
                  className="grid grid-cols-2 gap-2"
                >
                  <Label htmlFor="gift-type-spins" className="flex cursor-pointer items-center gap-2 rounded-md border p-3 hover:bg-muted/40">
                    <RadioGroupItem value="spins" id="gift-type-spins" />
                    <span>إرسال اللفات</span>
                  </Label>
                  <Label htmlFor="gift-type-coupon" className="flex cursor-pointer items-center gap-2 rounded-md border p-3 hover:bg-muted/40">
                    <RadioGroupItem value="coupon" id="gift-type-coupon" />
                    <span>إرسال القسيمة</span>
                  </Label>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gift-quantity">العدد</Label>
                <Input
                  id="gift-quantity"
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  value={giftQuantity}
                  onChange={(event) => setGiftQuantity(event.target.value)}
                />
              </div>
            </div>

            {giftType === "coupon" && (
              <div className="space-y-2">
                <Label>نوع القسيمة</Label>
                {giftOptionsLoading ? (
                  <Skeleton className="h-11 w-full" />
                ) : giftCouponTypes.length === 0 ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-300">
                    لا توجد قسائم موجودة يمكن استخدامها كنموذج.
                  </div>
                ) : (
                  <RadioGroup value={selectedCouponTemplate} onValueChange={setSelectedCouponTemplate} className="grid gap-2 sm:grid-cols-2">
                    {giftCouponTypes.map((coupon) => (
                      <Label
                        key={coupon.id}
                        htmlFor={`gift-coupon-${coupon.id}`}
                        className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/40"
                      >
                        <RadioGroupItem value={coupon.id} id={`gift-coupon-${coupon.id}`} />
                        <span className="flex-1">
                          <span className="block font-medium">خصم {coupon.discountPercentage}%</span>
                          <span className="block text-xs text-muted-foreground">
                            {coupon.maxDiscountAmount === null ? "بلا سقف" : `سقف ${formatDZD(coupon.maxDiscountAmount)}`}
                            {" • نوع جاهز للإهداء"}
                          </span>
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setGiftOpen(false)} disabled={giftSubmitting}>إلغاء</Button>
              <Button onClick={submitGift} disabled={giftSubmitting || giftUsersLoading || giftOptionsLoading}>
                {giftSubmitting ? "جارٍ الإرسال…" : "إرسال الهدية"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  loading,
  valueClass = "",
}: {
  title: string;
  value: string;
  icon: typeof Activity;
  loading: boolean;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? <Skeleton className="mt-2 h-9 w-24" /> : <p className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</p>}
        </div>
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}