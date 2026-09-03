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

export interface MenuItem {
  id: number;
  venue_id: number;
  name: string;
  active: 0 | 1;
  created_at: string;
}

export interface LunchRequest {
  id: number;
  venue_id: number;
  date: string; // "YYYY-MM-DD"
  person_name: string;
  mode: RequestMode;
  dish: string; // the menu item name chosen at order time (denormalized on purpose)
  note: string | null; // optional free-text note (e.g. "no onions")
  edit_token: string;
  created_at: string;
  cancelled_at: string | null;
}

export interface SentMark {
  venue_id: number;
  date: string;
  sent_at: string;
}
