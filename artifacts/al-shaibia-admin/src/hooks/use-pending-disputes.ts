import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export function usePendingDisputeCount() {
  const [count, setCount] = useState(0);
  const channelName = useRef(
    `pending-disputes-count-${Math.random().toString(36).slice(2)}`,
  );

  async function fetchCount() {
    const { count: c } = await supabase
      .from("ratings")
      .select("*", { count: "exact", head: true })
      .eq("is_disputed", true);
    setCount(c ?? 0);
  }

  useEffect(() => {
    fetchCount();
    const channel = supabase
      .channel(channelName.current)
      .on("postgres_changes", { event: "*", schema: "public", table: "ratings" }, fetchCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  return count;
}
