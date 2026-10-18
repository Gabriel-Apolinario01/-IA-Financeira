import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// One aggregate per platform identity keeps every financial reference owner-scoped.
export const workspaces = sqliteTable("workspaces", {
  ownerId: text("owner_id").primaryKey(),
  generation: text("generation").notNull(),
  stateJson: text("state_json").notNull(),
  revision: integer("revision").notNull().default(0),
  processedJson: text("processed_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const rateLimits = sqliteTable("rate_limits", {
  ownerId: text("owner_id").notNull(),
  bucket: text("bucket").notNull(),
  windowStart: integer("window_start").notNull(),
  requestCount: integer("request_count").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.ownerId, table.bucket] })]);
