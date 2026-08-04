import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * Pool configuration — network-partition behaviour
 * -------------------------------------------------
 * connectionTimeoutMillis (5 000 ms)
 *   Caps how long pool.connect() will wait for a new TCP connection.
 *   During a partition, any new connection attempt rejects after 5 s with
 *   a timeout error instead of hanging indefinitely. This is the primary
 *   guard that keeps /health/ready responsive during a partition.
 *
 * keepAlive / keepAliveInitialDelayMillis (10 000 ms)
 *   Once a TCP connection is established, the OS sends keepalive probes
 *   after 10 s of inactivity. If the remote side is unreachable (partition),
 *   the probes fail and the OS closes the socket — at which point pg emits
 *   an 'error' event on the pool for that idle client. The pool's 'error'
 *   listener (below) absorbs this without crashing the process.
 *   Note: the OS-level TCP_KEEPINTVL + TCP_KEEPCNT determine the total time
 *   before the kernel gives up (~90 s on Linux defaults). keepAlive ensures
 *   this happens rather than leaving zombie connections open forever.
 *
 * idleTimeoutMillis (30 000 ms)
 *   Closes idle pool clients after 30 s. During a clean idle period this
 *   reduces the number of sockets that need to be recovered by keepalive
 *   probes after a partition clears.
 *
 * Together these settings mean:
 *   - New requests during a partition: fail within 5 s (connectionTimeoutMillis)
 *   - Idle clients that were alive at partition start: recovered within
 *     ~10 s + OS TCP keepalive timeout (keepAlive + keepAliveInitialDelayMillis)
 *   - No hung requests, no zombie connections
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on("error", (err) => {
  console.error("[db-pool] idle client error", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
