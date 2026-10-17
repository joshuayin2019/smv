// import { Pool } from "pg";

// const globalForPg = globalThis as unknown as { pgPool?: Pool };

// export const conn =
//   globalForPg.pgPool ??
//   new Pool({
//     user: process.env.PGSQL_USER,
//     password: process.env.PGSQL_PASSWORD,
//     host: process.env.PGSQL_HOST,
//     port: Number(process.env.PGSQL_PORT),
//     database: process.env.PGSQL_DATABASE,
//   });

// if (process.env.NODE_ENV !== "production") {
//   globalForPg.pgPool = conn;
// }

import { Pool } from "pg";

const g = globalThis as unknown as { pgPool?: Pool };

export const conn = (g.pgPool ??= new Pool({
  user: process.env.PGSQL_USER,
  password: process.env.PGSQL_PASSWORD,
  host: process.env.PGSQL_HOST,
  port: Number(process.env.PGSQL_PORT ?? 5432),
  database: process.env.PGSQL_DATABASE,
  max: 20,
}));

conn.on("error", (e) => console.error("pg pool error:", e));