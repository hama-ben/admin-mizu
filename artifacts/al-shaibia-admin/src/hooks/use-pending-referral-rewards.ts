import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAutoRefresh } from "./use-auto-refresh";

export function usePendingReferralRewardCount() {
  const [count, setCount] = useState(0);

  async function fetchCount() {
    try {
      const result = await api.get<{ count: number }>("/referral-rewards/pending-count");
      setCount(result.count ?? 0);
    } catch {
      // The page/API error state handles failures when opened. Keep the
      // sidebar unobtrusive if a background badge refresh is unavailable.
    }
  }

  useEffect(() => {
    fetchCount();
  }, []);
  useAutoRefresh(fetchCount, 10000);

  return count;
}