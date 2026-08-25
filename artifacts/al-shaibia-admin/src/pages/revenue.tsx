import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Image as ImageIcon, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import type { RevenueTransaction } from "@/lib/supabase";
import { formatDate } from "@/lib/constants";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

interface RevenueResponse {
  totalRevenue: number;
  transactionCount: number;
  transactions: RevenueTransaction[];
}

const formatAmount = (amount: number) =>
  new Intl.NumberFormat("ar-DZ", { maximumFractionDigits: 0 }).format(amount) + " دج";

export default function RevenuePage() {
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { toast } = useToast();

  async function loadRevenue(background = false) {
    if (!background) setLoading(true);
    try {
      setData(await api.get<RevenueResponse>("/revenue"));
    } catch (error: any) {
      if (!background) toast({ title: "تعذر جلب سجل الإيرادات", description: error.message, variant: "destructive" });
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => { loadRevenue(); }, []);
  useAutoRefresh(() => loadRevenue(true));

  const transactions = data?.transactions ?? [];
  const totalRevenue = useMemo(() => data?.totalRevenue ?? 0, [data]);

  function downloadPdf() {
    if (!data || transactions.length === 0) {
      toast({ title: "لا توجد إيرادات للتنزيل", description: "ستظهر المعاملات بعد اعتماد مدفوعات السائقين." });
      return;
    }

    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.setFontSize(18);
      doc.text("Al-Shaibia - Driver Revenue Report", 14, 15);
      doc.setFontSize(11);
      doc.text(`Total revenue: ${totalRevenue.toLocaleString("en-US")} DZD`, 14, 23);
      doc.text(`Approved transactions: ${transactions.length}`, 14, 30);

      autoTable(doc, {
        startY: 37,
        head: [["Transaction", "Driver", "Phone", "Email", "Amount", "Approved at", "Receipt"]],
        body: transactions.map((transaction) => [
          transaction.transaction_number,
          transaction.driver?.name ?? transaction.driver_id,
          transaction.driver?.phone ?? "—",
          transaction.driver?.email ?? "—",
          `${transaction.amount.toLocaleString("en-US")} DZD`,
          transaction.approved_at ? new Date(transaction.approved_at).toLocaleString("en-GB") : "—",
          transaction.receipt_image ? "Attached" : "Not available",
        ]),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [27, 163, 177] },
      });
      doc.save(`al-shaibia-revenue-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="animate-in fade-in space-y-6 p-4 duration-500 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <TrendingUp className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">إجمالي الإيرادات</h1>
          </div>
          <p className="mt-2 text-muted-foreground">السجل المالي للمدفوعات المعتمدة من السائقين.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => loadRevenue()} disabled={loading} className="gap-2">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> تحديث
          </Button>
          <Button onClick={downloadPdf} disabled={exporting || loading} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            تنزيل PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm text-muted-foreground">إجمالي الإيرادات</p>
              <p className="mt-2 text-3xl font-bold text-primary">{formatAmount(totalRevenue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">من المدفوعات المعتمدة فقط</p>
            </div>
            <TrendingUp className="h-10 w-10 text-primary/70" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm text-muted-foreground">عدد المعاملات</p>
              <p className="mt-2 text-3xl font-bold">{data?.transactionCount ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">إيصالات مقبولة</p>
            </div>
            <FileText className="h-10 w-10 text-muted-foreground/60" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : transactions.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">لا توجد معاملات مالية معتمدة بعد.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-right text-muted-foreground">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">رقم المعاملة</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">السائق</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">الهاتف</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">البريد الإلكتروني</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">المبلغ</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">تاريخ الاعتماد</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">الوصل</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="max-w-[180px] truncate px-4 py-4 font-mono text-xs" title={transaction.transaction_number}>{transaction.transaction_number}</td>
                      <td className="px-4 py-4 font-medium">{transaction.driver?.name ?? transaction.driver_id}</td>
                      <td className="px-4 py-4 text-muted-foreground">{transaction.driver?.phone ?? "—"}</td>
                      <td className="px-4 py-4 text-muted-foreground">{transaction.driver?.email ?? "—"}</td>
                      <td className="px-4 py-4 font-semibold text-primary">{formatAmount(transaction.amount)}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatDate(transaction.approved_at ?? transaction.created_at)}</td>
                      <td className="px-4 py-4">
                        {transaction.receipt_image ? (
                          <button className="flex items-center gap-1 text-primary hover:underline" onClick={() => setSelectedImage(transaction.receipt_image!)}>
                            <ImageIcon className="h-4 w-4" /> عرض الوصل
                          </button>
                        ) : <span className="text-muted-foreground">غير متوفر</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-4xl bg-transparent p-0 shadow-none">
          {selectedImage && <img src={selectedImage} alt="معاينة وصل المعاملة" className="max-h-[85vh] w-full rounded-md object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}