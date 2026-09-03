export type VenueMode = "dine_in" | "takeaway" | "both";
export type RequestMode = "dine_in" | "takeaway";

export interface Venue {
  id: number;
  name: string;
  mode: VenueMode;
  cutoff_time: string; // "HH:MM", server-local
  contact: string | null;
  active: 0 | 1;
  created_at: string;
}

export interface LunchRequest {
  id: number;
  venue_id: number;
  date: string; // "YYYY-MM-DD"
  person_name: string;
  mode: RequestMode;
  order_text: string;
  edit_token: string;
  created_at: string;
  cancelled_at: string | null;
}

export interface SentMark {
  venue_id: number;
  date: string;
  sent_at: string;
}
