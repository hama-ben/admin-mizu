import { usePendingDisputeCount } from "./use-pending-disputes";
import { useDriverCounts } from "./use-driver-counts";
import { useSupportUnreadCount } from "./use-support-unread";

export function useTotalNotificationCount(): number {
  const pendingDisputes = usePendingDisputeCount();
  const driverCounts = useDriverCounts();
  const supportUnread = useSupportUnreadCount();
  return (pendingDisputes ?? 0) + (driverCounts.pending ?? 0) + (supportUnread ?? 0);
}
