interface LegendItem {
  color: string;
  label: string;
}

const LEGENDS: Record<string, LegendItem[]> = {
  orders: [
    { color: "bg-green-500",  label: "تم التوصيل" },
    { color: "bg-blue-400",   label: "قيد التوصيل" },
    { color: "bg-purple-400", label: "وصل السائق" },
    { color: "bg-amber-500",  label: "معلّق" },
  ],
  users: [
    { color: "bg-green-500",  label: "موافق عليه" },
    { color: "bg-amber-500",  label: "معلّق" },
    { color: "bg-red-500",    label: "محظور" },
    { color: "bg-slate-400",  label: "موقوف" },
  ],
  payments: [
    { color: "bg-green-500", label: "مقبول" },
    { color: "bg-amber-500", label: "معلّق" },
    { color: "bg-red-500",   label: "مرفوض" },
  ],
};

export function StatusLegend({ variant }: { variant: keyof typeof LEGENDS }) {
  const items = LEGENDS[variant];
  return (
    <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap text-xs text-muted-foreground py-2 px-1">
      <span className="font-medium text-muted-foreground/70 shrink-0">دليل الحالات:</span>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${item.color}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
