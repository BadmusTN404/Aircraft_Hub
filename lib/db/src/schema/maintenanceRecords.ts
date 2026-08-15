import { pgTable, serial, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { aircraftTable } from "./aircraft";

export const maintenanceRecordsTable = pgTable("maintenance_records", {
  id: serial("id").primaryKey(),
  aircraftId: integer("aircraft_id")
    .notNull()
    .references(() => aircraftTable.id),
  documentName: varchar("document_name", { length: 220 }).notNull(),
  recordType: varchar("record_type", { length: 40 }).notNull(),
  airline: varchar("airline", { length: 160 }).notNull(),
  objectPath: text("object_path"),
  fileSize: integer("file_size").notNull().default(0),
  description: text("description"),
  reviewStatus: varchar("review_status", { length: 24 }).notNull().default("pending"),
  uploadedBy: varchar("uploaded_by", { length: 160 }).notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const activityTable = pgTable("maintenance_activity", {
  id: serial("id").primaryKey(),
  kind: varchar("kind", { length: 40 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMaintenanceRecordSchema = createInsertSchema(maintenanceRecordsTable).omit({
  id: true,
  uploadedAt: true,
  reviewedAt: true,
});
export type InsertMaintenanceRecord = typeof maintenanceRecordsTable.$inferInsert;
export type MaintenanceRecord = typeof maintenanceRecordsTable.$inferSelect;