import { Router } from "express";
import type Database from "better-sqlite3";
import { cutoffInstant, isDateSelectable, isPastCutoff, today, MAX_DAYS_AHEAD } from "../services/cutoff";
import {
  cancelRequest,
  createRequest,
  getRequestByToken,
  getVenue,
  listActiveVenues,
  updateRequest,
} from "../repo";
import type { RequestMode, VenueMode } from "../types";

export function employeeRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/", (_req, res) => res.redirect(`/order?date=${today()}`));

  router.get("/order", (req, res) => {
    const date = typeof req.query.date === "string" ? req.query.date : today();
    if (!isDateSelectable(date)) {
      return res.redirect(`/order?date=${today()}`);
    }
    const venues = listActiveVenues(db).map((v) => ({
      ...v,
      closed: isPastCutoff(v, date),
      cutoffAt: cutoffInstant(v, date),
    }));
    res.render("order", { date, venues, maxDaysAhead: MAX_DAYS_AHEAD, today: today() });
  });

  router.get("/order/new", (req, res) => {
    const date = String(req.query.date || "");
    const venueId = Number(req.query.venueId);
    const venue = getVenue(db, venueId);
    if (!venue || !isDateSelectable(date) || isPastCutoff(venue, date)) {
      return res.redirect(`/order?date=${isDateSelectable(date) ? date : today()}`);
    }
    res.render("order-new", { date, venue, error: null });
  });

  router.post("/order/new", (req, res) => {
    const date = String(req.body.date || "");
    const venueId = Number(req.body.venueId);
    const venue = getVenue(db, venueId);
    const personName = String(req.body.personName || "").trim();
    const orderText = String(req.body.orderText || "").trim();
    const mode = String(req.body.mode || "") as RequestMode;

    if (!venue || !isDateSelectable(date)) {
      return res.redirect(`/order?date=${isDateSelectable(date) ? date : today()}`);
    }

    const modeAllowed = isModeAllowed(venue.mode, mode);
    if (isPastCutoff(venue, date) || !personName || !orderText || !modeAllowed) {
      return res.status(400).render("order-new", {
        date,
        venue,
        error: "Controlla i dati inseriti: nome, ordine e orario di chiusura del locale.",
      });
    }

    const request = createRequest(db, { venueId, date, personName, mode, orderText });
    res.redirect(`/order/${request.id}?token=${request.edit_token}`);
  });

  router.get("/order/:id", (req, res) => {
    const id = Number(req.params.id);
    const token = String(req.query.token || "");
    const request = getRequestByToken(db, id, token);
    if (!request || request.cancelled_at) {
      return res.status(404).render("order-manage", { request: null, venue: null, closed: true });
    }
    const venue = getVenue(db, request.venue_id)!;
    res.render("order-manage", {
      request,
      venue,
      closed: isPastCutoff(venue, request.date),
      error: null,
    });
  });

  router.post("/order/:id", (req, res) => {
    const id = Number(req.params.id);
    const token = String(req.query.token || req.body.token || "");
    const request = getRequestByToken(db, id, token);
    if (!request || request.cancelled_at) return res.redirect("/order");

    const venue = getVenue(db, request.venue_id)!;
    if (isPastCutoff(venue, request.date)) {
      return res.redirect(`/order/${id}?token=${token}`);
    }

    const orderText = String(req.body.orderText || "").trim();
    const mode = String(req.body.mode || "") as RequestMode;
    if (!orderText || !isModeAllowed(venue.mode, mode)) {
      return res.status(400).render("order-manage", {
        request,
        venue,
        closed: false,
        error: "Controlla i dati inseriti.",
      });
    }

    updateRequest(db, id, { mode, orderText });
    res.redirect(`/order/${id}?token=${token}`);
  });

  router.post("/order/:id/cancel", (req, res) => {
    const id = Number(req.params.id);
    const token = String(req.query.token || req.body.token || "");
    const request = getRequestByToken(db, id, token);
    if (request && !request.cancelled_at) {
      const venue = getVenue(db, request.venue_id)!;
      if (!isPastCutoff(venue, request.date)) {
        cancelRequest(db, id);
      }
    }
    res.redirect("/order");
  });

  return router;
}

function isModeAllowed(venueMode: VenueMode, requestMode: RequestMode): boolean {
  if (!requestMode) return false;
  return venueMode === "both" || venueMode === requestMode;
}
