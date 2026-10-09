import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const conn =
  globalForPg.pgPool ??
  new Pool({
    user: process.env.PGSQL_USER,
    password: process.env.PGSQL_PASSWORD,
    host: process.env.PGSQL_HOST,
    port: Number(process.env.PGSQL_PORT),
    database: process.env.PGSQL_DATABASE,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = conn;
}