import { sql } from "drizzle-orm";
import { pgTable, real, serial, integer, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const aircraftTable = pgTable("aircraft", {
  id: serial("id").primaryKey(),
  registration: varchar("registration", { length: 32 }).notNull().unique(),
  aircraftType: varchar("aircraft_type", { length: 80 }).notNull(),
  serialNumber: varchar("serial_number", { length: 80 }).notNull(),
  operator: varchar("operator", { length: 120 }).notNull(),
  totalHours: real("total_hours").notNull().default(0),
  totalCycles: integer("total_cycles").notNull().default(0),
  status: varchar("status", { length: 24 }).notNull().default("serviceable"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertAircraftSchema = createInsertSchema(aircraftTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertAircraft = typeof aircraftTable.$inferInsert;
export type Aircraft = typeof aircraftTable.$inferSelect;