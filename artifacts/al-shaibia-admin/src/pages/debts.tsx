import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, CalendarDays, ChevronLeft, CreditCard, Eye, Filter, MapPin, Phone, RefreshCw, Search, UserRound, Users, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { ALGERIAN_WILAYAS, formatDZD, formatDate } from "@/lib/constants";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DebtAccount {
  accountId: string;
  driver: { id: string; name: string | null; phone: string | null; wilaya: string | null; commune: string | null };
  consumer: { id: string; name: string | null; phone: string | null; email: string | null };
  debtCeiling: number;
  balance: number;
  status: string;
  entryCount: number;
  purchaseTotal: number;
  createdAt: string;
  updatedAt: string;
}

interface DebtStats {
  totalAccounts: number;
  consumersWithDebt: number;
  totalDebt: number;
  totalPurchases: number;
  totalEntries: number;
}

interface DebtBookResponse {
  data: DebtAccount[];
  stats: DebtStats;
}

interface DebtEntry {
  id: string;
  orderId: string;
  amount: number;
  createdAt: string;
  paymentMethod: string | null;
  waterVolume: string | null;
  barrelCount: number | null;
  orderStatus: string | null;
  orderCreatedAt: string | null;
  deliveredAt: string | null;
}

interface DebtAccountDetail {
  account: DebtAccount;
  entries: DebtEntry[];
}

interface DriverDebtSummary {
  driver: DebtAccount["driver"];
  totalDebt: number;
  totalAccounts: number;
  consumers: DebtAccount[];
}

const EMPTY_STATS: DebtStats = {
  totalAccounts: 0,
  consumersWithDebt: 0,
  totalDebt: 0,
  totalPurchases: 0,
  totalEntries: 0,
};

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "نشط",
    open: "مفتوح",
    pending: "معلق",
    closed: "مغلق",
    paid: "مسدد",
  };
  return labels[status.toLowerCase()] ?? status;
}

function statusStyle(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "paid" || normalized === "closed") return "bg-green-500/15 text-green-400 border-green-500/20";
  if (normalized === "pending") return "bg-amber-500/15 text-amber-400 border-amber-500/20";
  return "bg-blue-500/15 text-blue-400 border-blue-500/20";
}

function ceilingState(balance: number, ceiling: number) {
  if (ceiling > 0 && balance > ceiling) return { label: "تجاوز السقف", className: "text-red-400" };
  if (ceiling > 0 && balance >= ceiling * 0.8) return { label: "اقترب من السقف", className: "text-amber-400" };
  return null;
}

function StatCard({ icon: Icon, label, value, tone = "text-primary" }: { icon: typeof Wallet; label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-bold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DebtsPage() {
  const [accounts, setAccounts] = useState<DebtAccount[]>([]);
  const [stats, setStats] = useState<DebtStats>(EMPTY_STATS);
  const [wilaya, setWilaya] = useState("all");
  const [commune, setCommune] = useState("");
  const [driverName, setDriverName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("all");
  const [balanceFilter, setBalanceFilter] = useState("all");
  const [ceilingFilter, setCeilingFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<DriverDebtSummary | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<DebtAccountDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { toast } = useToast();

  const canSearch = wilaya !== "all" && commune.trim().length > 0;

  async function loadDebts(background = false) {
    if (!canSearch) {
      setAccounts([]);
      setStats(EMPTY_STATS);
      setError(null);
      setLoading(false);
      return;
    }
    if (!background) setLoading(true);
    try {
      const params = new URLSearchParams({
        wilaya,
        commune: commune.trim(),
        driverName: driverName.trim(),
        phone: phone.trim(),
        status,
        balance: balanceFilter,
        ceiling: ceilingFilter,
        sort,
      });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const result = await api.get<DebtBookResponse>(`/debt-book?${params.toString()}`);
      setAccounts(result.data ?? []);
      setStats(result.stats ?? EMPTY_STATS);
      setError(null);
    } catch (err: any) {
      setError(err.message || "تعذر الاتصال بالخادم");
      if (!background) {
        toast({ title: "تعذر جلب دفتر الديون", description: err.message, variant: "destructive" });
      }
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => loadDebts(), 250);
    return () => clearTimeout(timer);
  }, [wilaya, commune, driverName, phone, status, balanceFilter, ceilingFilter, sort, dateFrom, dateTo]);

  useAutoRefresh(() => loadDebts(true), 10000);

  const drivers = useMemo(() => {
    const grouped = new Map<string, DriverDebtSummary>();
    for (const account of accounts) {
      const existing = grouped.get(account.driver.id);
      if (existing) {
        existing.totalDebt += account.balance;
        existing.totalAccounts += 1;
        existing.consumers.push(account);
      } else {
        grouped.set(account.driver.id, {
          driver: account.driver,
          totalDebt: account.balance,
          totalAccounts: 1,
          consumers: [account],
        });
      }
    }
    return [...grouped.values()].sort((a, b) => {
      if (sort === "amount") return b.totalDebt - a.totalDebt;
      return (a.driver.name ?? "").localeCompare(b.driver.name ?? "", "ar");
    });
  }, [accounts, sort]);

  async function openAccount(accountId: string) {
    setDetailLoading(true);
    setSelectedAccount(null);
    try {
      setSelectedAccount(await api.get<DebtAccountDetail>(`/debt-book/${encodeURIComponent(accountId)}`));
    } catch (err: any) {
      toast({ title: "تعذر جلب تفاصيل الحساب", description: err.message, variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <BookOpen className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">دفتر الديون</h1>
          </div>
          <p className="mt-2 text-muted-foreground">مراقبة الحسابات والطلبات المسجلة بالدين بين السائقين والمستهلكين.</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => loadDebts()} disabled={loading || !canSearch}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> تحديث
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="flex items-start gap-3 p-4">
          <Filter className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold">اختر الولاية و البلدية لاظهار السائقين الدائنين</p>
            <p className="mt-1 text-sm text-muted-foreground">بعد اختيار الموقع يمكنك تضييق البحث بالاسم أو رقم الهاتف.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">الولاية</label>
          <Select value={wilaya} onValueChange={(value) => setWilaya(value)}>
            <SelectTrigger><SelectValue placeholder="اختر الولاية" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">اختر الولاية</SelectItem>
              {ALGERIAN_WILAYAS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">البلدية</label>
          <Input value={commune} onChange={(event) => setCommune(event.target.value)} placeholder="اكتب اسم البلدية" />
        </div>
        <div className="relative">
          <label className="mb-2 block text-xs font-medium text-muted-foreground">اسم السائق</label>
          <Search className="absolute right-3 top-[2.35rem] h-4 w-4 text-muted-foreground" />
          <Input className="pr-9" value={driverName} onChange={(event) => setDriverName(event.target.value)} placeholder="بحث بالاسم" />
        </div>
        <div className="relative">
          <label className="mb-2 block text-xs font-medium text-muted-foreground">رقم الهاتف</label>
          <Phone className="absolute right-3 top-[2.35rem] h-4 w-4 text-muted-foreground" />
          <Input dir="ltr" className="pr-9 text-right" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="بحث بالهاتف" />
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">حالة الحساب</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="pending">معلق</SelectItem>
              <SelectItem value="closed">مغلق</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">الرصيد</label>
          <Select value={balanceFilter} onValueChange={setBalanceFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحسابات</SelectItem>
              <SelectItem value="positive">الرصيد أكبر من صفر</SelectItem>
              <SelectItem value="zero">الرصيد يساوي صفر</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">السقف</label>
          <Select value={ceilingFilter} onValueChange={setCeilingFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المستويات</SelectItem>
              <SelectItem value="near">اقترب من السقف</SelectItem>
              <SelectItem value="exceeded">تجاوز السقف</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">ترتيب النتائج</label>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">الأحدث أولاً</SelectItem>
              <SelectItem value="amount">أكبر رصيد دين</SelectItem>
              <SelectItem value="purchases">أكبر مشتريات بالدين</SelectItem>
              <SelectItem value="oldest">الأقدم أولاً</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">من تاريخ إنشاء الحساب</label>
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">إلى تاريخ إنشاء الحساب</label>
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
      </div>

      {!canSearch ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          <MapPin className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium text-foreground">اختر الولاية والبلدية أولاً</p>
          <p className="mt-1 text-sm">سيتم عرض السائقين الدائنين في الموقع المحدد.</p>
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>تعذر تحميل دفتر الديون</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => loadDebts()} disabled={loading}>إعادة المحاولة</Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={BookOpen} label="إجمالي حسابات الدين" value={String(stats.totalAccounts)} />
            <StatCard icon={Users} label="مستهلكون لديهم دين" value={String(stats.consumersWithDebt)} tone="text-amber-400" />
            <StatCard icon={Wallet} label="إجمالي الديون المستحقة" value={formatDZD(stats.totalDebt)} tone="text-red-400" />
            <StatCard icon={CreditCard} label="مجموع المشتريات بالدين" value={formatDZD(stats.totalPurchases)} tone="text-blue-400" />
            <StatCard icon={CalendarDays} label="طلبات مسجلة بالدين" value={String(stats.totalEntries)} tone="text-green-400" />
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>السائق</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>البلدية</TableHead>
                  <TableHead>إجمالي الدين</TableHead>
                  <TableHead>عدد المستهلكين</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-right">التفاصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array(5).fill(0).map((_, index) => (
                    <TableRow key={index}>{Array(7).fill(0).map((__, cell) => <TableCell key={cell}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : drivers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                      <Wallet className="mx-auto mb-3 h-10 w-10 opacity-30" />
                      <p className="font-medium text-foreground">لا توجد نتائج في هذه البلدية</p>
                      <p className="mt-1 text-sm">جرّب تغيير الفلاتر أو اختيار بلدية أخرى.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  drivers.map((driver) => {
                    const state = driver.consumers.reduce((current, account) => {
                      const next = ceilingState(account.balance, account.debtCeiling);
                      return next?.label === "تجاوز السقف" ? next : current ?? next;
                    }, ceilingState(0, 0));
                    return (
                      <TableRow key={driver.driver.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedDriver(driver)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="h-4 w-4" /></div>
                            <div>
                              <p className="font-semibold">{driver.driver.name || "سائق بدون اسم"}</p>
                              <p className="font-mono text-[11px] text-muted-foreground">{driver.driver.id.slice(0, 12)}…</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell dir="ltr" className="text-sm text-muted-foreground">{driver.driver.phone || "—"}</TableCell>
                        <TableCell className="text-sm">{driver.driver.commune || "—"}</TableCell>
                        <TableCell className="font-semibold text-red-400">{formatDZD(driver.totalDebt)}</TableCell>
                        <TableCell><Badge variant="secondary">{driver.totalAccounts} مستهلك</Badge></TableCell>
                        <TableCell>{state && <span className={`text-xs font-medium ${state.className}`}>{state.label}</span>}</TableCell>
                        <TableCell className="text-right"><Button variant="ghost" size="sm" className="gap-1.5">عرض المستهلكين <ChevronLeft className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={!!selectedDriver} onOpenChange={(open) => !open && setSelectedDriver(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />المستهلكون الذين لديهم دين مع السائق</DialogTitle>
          </DialogHeader>
          {selectedDriver && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-lg font-semibold">{selectedDriver.driver.name || "سائق بدون اسم"}</p>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {selectedDriver.driver.phone && <span className="flex items-center gap-1" dir="ltr"><Phone className="h-3.5 w-3.5" />{selectedDriver.driver.phone}</span>}
                  {selectedDriver.driver.commune && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{selectedDriver.driver.commune}، {selectedDriver.driver.wilaya}</span>}
                </div>
                <p className="mt-3 text-sm">إجمالي ديون المستهلكين: <strong className="text-red-400">{formatDZD(selectedDriver.totalDebt)}</strong></p>
              </div>
              <div className="max-h-[440px] overflow-y-auto rounded-lg border">
                {selectedDriver.consumers.map((account) => {
                  const state = ceilingState(account.balance, account.debtCeiling);
                  return (
                    <button key={account.accountId} type="button" className="flex w-full items-center justify-between gap-3 border-b p-4 text-right last:border-b-0 hover:bg-muted/40" onClick={() => openAccount(account.accountId)}>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><UserRound className="h-4 w-4" /></div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{account.consumer.name || "مستهلك بدون اسم"}</p>
                          <p dir="ltr" className="mt-1 text-xs text-muted-foreground">{account.consumer.phone || account.consumer.email || "لا توجد بيانات اتصال"}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div className="text-left">
                          <p className="font-semibold text-red-400">{formatDZD(account.balance)}</p>
                          <p className={`mt-1 text-[11px] ${state?.className ?? "text-muted-foreground"}`}>{state?.label ?? statusLabel(account.status)}</p>
                        </div>
                        <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedAccount || detailLoading} onOpenChange={(open) => !open && !detailLoading && setSelectedAccount(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-primary" />تفاصيل حساب الدين</DialogTitle></DialogHeader>
          {detailLoading ? (
            <div className="space-y-4 py-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-48 w-full" /></div>
          ) : selectedAccount ? (
            <div className="space-y-5 pt-2">
              <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">السائق</p><p className="mt-1 font-semibold">{selectedAccount.account.driver.name || "—"}</p><p dir="ltr" className="mt-1 text-xs text-muted-foreground">{selectedAccount.account.driver.phone || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">المستهلك</p><p className="mt-1 font-semibold">{selectedAccount.account.consumer.name || "—"}</p><p dir="ltr" className="mt-1 text-xs text-muted-foreground">{selectedAccount.account.consumer.phone || selectedAccount.account.consumer.email || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">الرصيد الحالي</p><p className="mt-1 font-bold text-red-400">{formatDZD(selectedAccount.account.balance)}</p></div>
                <div><p className="text-xs text-muted-foreground">سقف الدين / المتبقي</p><p className="mt-1 font-semibold">{formatDZD(selectedAccount.account.debtCeiling)} / {formatDZD(Math.max(0, selectedAccount.account.debtCeiling - selectedAccount.account.balance))}</p></div>
                <div><p className="text-xs text-muted-foreground">الحالة</p><Badge variant="outline" className={`mt-1 ${statusStyle(selectedAccount.account.status)}`}>{statusLabel(selectedAccount.account.status)}</Badge></div>
                <div><p className="text-xs text-muted-foreground">التواريخ</p><p className="mt-1 text-xs">إنشاء: {formatDate(selectedAccount.account.createdAt)} · تحديث: {formatDate(selectedAccount.account.updatedAt)}</p></div>
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">المشتريات المسجلة بالدين</h3><Badge variant="secondary">{selectedAccount.entries.length} عملية</Badge></div>
                {selectedAccount.entries.length === 0 ? (
                  <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">هذا الحساب لا يحتوي على عمليات دين.</div>
                ) : (
                  <div className="max-h-[360px] overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader><TableRow><TableHead>رقم الطلب</TableHead><TableHead>قيمة العملية</TableHead><TableHead>التفاصيل</TableHead><TableHead>الحالة</TableHead><TableHead>التاريخ</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {selectedAccount.entries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-mono text-xs">{entry.orderId}</TableCell>
                            <TableCell className="font-semibold text-red-400">{formatDZD(entry.amount)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{entry.waterVolume || "—"} · {entry.barrelCount ?? "—"} برميل · {entry.paymentMethod || "debt"}</TableCell>
                            <TableCell><Badge variant="outline">{statusLabel(entry.orderStatus || "—")}</Badge></TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(entry.deliveredAt || entry.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}