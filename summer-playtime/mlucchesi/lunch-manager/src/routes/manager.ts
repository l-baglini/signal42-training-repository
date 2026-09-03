import { Router } from "express";
import type Database from "better-sqlite3";
import { isValidCutoffTime, today } from "../services/cutoff";
import { draftMessage } from "../services/messageDraft";
import {
  createVenue,
  getVenue,
  isSent,
  listActiveVenues,
  listRequestsForDate,
  markSent,
  unmarkSent,
} from "../repo";
import type { VenueMode } from "../types";

const VALID_VENUE_MODES: VenueMode[] = ["dine_in", "takeaway", "both"];

export function managerRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/manager", (req, res) => {
    const date = typeof req.query.date === "string" && req.query.date ? req.query.date : today();
    const venues = listActiveVenues(db);
    const requests = listRequestsForDate(db, date);

    // Every active venue is shown, even with zero requests, so the manager sees the full picture.
    const groups = venues.map((venue) => ({
      venue,
      requests: requests.filter((r) => r.venue_id === venue.id),
      sent: isSent(db, venue.id, date),
    }));

    res.render("manager", { date, groups });
  });

  router.post("/manager/venues", (req, res) => {
    const name = String(req.body.name || "").trim();
    const mode = String(req.body.mode || "") as VenueMode;
    const cutoffTime = String(req.body.cutoffTime || "").trim();
    const contact = String(req.body.contact || "").trim() || null;
    const date = String(req.body.date || today());

    if (name && VALID_VENUE_MODES.includes(mode) && isValidCutoffTime(cutoffTime)) {
      createVenue(db, { name, mode, cutoffTime, contact });
    }
    res.redirect(`/manager?date=${date}`);
  });

  router.post("/manager/sent", (req, res) => {
    const venueId = Number(req.body.venueId);
    const date = String(req.body.date || today());
    if (isSent(db, venueId, date)) {
      unmarkSent(db, venueId, date);
    } else {
      markSent(db, venueId, date);
    }
    res.redirect(`/manager?date=${date}`);
  });

  // JSON endpoint: drafts (AI, with deterministic fallback) the venue message.
  router.post("/manager/api/message", async (req, res) => {
    const venueId = Number(req.body.venueId);
    const date = String(req.body.date || "");
    const venue = getVenue(db, venueId);
    if (!venue || !date) {
      return res.status(400).json({ error: "venueId e date sono obbligatori" });
    }

    const lines = listRequestsForDate(db, date)
      .filter((r) => r.venue_id === venueId)
      .map((r) => ({ personName: r.person_name, mode: r.mode, orderText: r.order_text }));

    const result = await draftMessage({ venueName: venue.name, date, lines });
    res.json(result);
  });

  return router;
}
