import express, { type Express } from "express";
import path from "path";
import type Database from "better-sqlite3";
import { employeeRouter } from "./routes/employee";
import { managerRouter } from "./routes/manager";

export function createApp(db: Database.Database): Express {
  const app = express();

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use(employeeRouter(db));
  app.use(managerRouter(db));

  return app;
}
