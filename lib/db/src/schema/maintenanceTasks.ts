import { pgTable, real, serial, integer, date, text, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { aircraftTable } from "./aircraft";

export const maintenanceTasksTable = pgTable("maintenance_tasks", {
  id: serial("id").primaryKey(),
  aircraftId: integer("aircraft_id")
    .notNull()
    .references(() => aircraftTable.id),
  title: varchar("title", { length: 180 }).notNull(),
  taskNumber: varchar("task_number", { length: 60 }).notNull(),
  category: varchar("category", { length: 32 }).notNull(),
  intervalHours: real("interval_hours"),
  intervalCycles: integer("interval_cycles"),
  intervalDays: integer("interval_days"),
  lastAccomplishedAt: date("last_accomplished_at"),
  nextDueAt: date("next_due_at"),
  nextDueHours: real("next_due_hours"),
  nextDueCycles: integer("next_due_cycles"),
  status: varchar("status", { length: 24 }).notNull().default("on_track"),
  owner: varchar("owner", { length: 120 }).notNull(),
  notes: text("notes"),
});

export const insertMaintenanceTaskSchema = createInsertSchema(maintenanceTasksTable).omit({
  id: true,
});
export type InsertMaintenanceTask = typeof maintenanceTasksTable.$inferInsert;
export type MaintenanceTask = typeof maintenanceTasksTable.$inferSelect;