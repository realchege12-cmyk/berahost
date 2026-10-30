import { index, json, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const sessionTable = pgTable("session", {
  sid: varchar("sid", { length: 255 }).primaryKey().notNull(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
}, (table) => ({ expireIndex: index("IDX_session_expire").on(table.expire) }));
