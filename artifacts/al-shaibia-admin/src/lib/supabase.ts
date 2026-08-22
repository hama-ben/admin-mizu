import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Table types (confirmed schema) ──────────────────────────────────────────

/**
 * users table — single table for ALL account types.
 * user_type: 'سائق' = driver, 'مستهلك' = consumer
 * account_status: 'pending' | 'approved' | 'rejected'
 * Columns: id, name, email, phone, password_hash, user_type, wilaya, commune,
 *          account_status, subscription_expires_at, free_trial_claimed,
 *          created_at, first_approval_granted
 */
export interface User {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  user_type: string;
  wilaya?: string | null;
  commune?: string | null;
  account_status?: string | null;
  subscription_expires_at?: string | null;
  free_trial_claimed?: boolean | null;
  first_approval_granted?: boolean | null;
  created_at?: string | null;
}

/**
 * driver_details — driver document photos & location.
 * FK: driver_id → users.id
 */
export interface DriverDetails {
  driver_id: string;
  wilaya?: string | null;
  commune?: string | null;
  truck_front_photo_url?: string | null;
  driver_license_url?: string | null;
  truck_side_photo_url?: string | null;
  truck_video_url?: string | null;
}

/**
 * driver_status — online/offline/busy status.
 * FK: driver_id → users.id
 */
export interface DriverStatus {
  driver_id: string;
  current_status?: string | null;
}

/**
 * orders table
 * status: 'معلق' → 'قيد التوصيل' → 'وصل السائق' → 'تم التوصيل'
 */
export interface Order {
  id: string;
  user_id: string;           // customer's users.id
  driver_id: string | null;  // driver's users.id (null until accepted)
  water_volume: string;
  barrel_count: number;
  total_price: number;
  latitude: string;
  longitude: string;
  status: string;
  created_at: string;
}

/**
 * subscription_payments table
 * driver_id → users.id
 */
export interface SubscriptionPayment {
  id: string;
  driver_id: string;
  receipt_image?: string | null;
  status: "pending" | "approved" | "rejected";
  admin_notes?: string | null;
  created_at: string;
  reviewed_at?: string | null;
}

/** announcements table */
export interface Announcement {
  id: string;
  title: string;
  content: string;
  target_audience: string;
  badge_text?: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * Shape used by the Disputes admin page.
 * Backed by the `ratings` table (filtered to is_disputed = true).
 * Column mapping: rated_user_id → driver_id, stars → rating,
 *                 dispute_reason → comment, dispute_status → status.
 * Requires `dispute_status` column on the ratings table — see migration note
 * in disputes.tsx.
 */
export interface RatingDispute {
  id: string;
  driver_id: string | null;
  rating: number;
  comment: string | null;
  wilaya: string | null; // not stored in ratings; always null
  status: "pending" | "resolved" | "dismissed";
  created_at: string;
}

/** support_messages table — requires sender_type + admin_id columns (ALTER TABLE migration needed) */
export interface SupportMessage {
  id: string;
  user_id: string | null;
  message: string;
  status: string | null;
  created_at: string;
  sender_type: "user" | "admin" | null;
  admin_id?: string | null;
}

export type PaymentStatus = "pending" | "approved" | "rejected";
export type DisputeStatus = "pending" | "resolved" | "dismissed";

// User type constants (confirmed Arabic values)
export const USER_TYPE_DRIVER = "سائق";
export const USER_TYPE_CONSUMER = "مستهلك";
