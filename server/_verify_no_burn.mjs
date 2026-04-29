import pg from "/Users/mattparry/Desktop/Future Collective/paperclip-build/node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js";
const c = new pg.Client({ connectionString: "postgres://paperclip:paperclip@127.0.0.1:54329/paperclip" });
await c.connect();
const r = await c.query(`SELECT count(*)::int n FROM agent_wakeup_requests WHERE reason='heartbeat_timer' AND created_at > NOW() - INTERVAL '90 seconds'`);
console.log("heartbeat_timer wakeups in last 90s:", r.rows[0].n);
const r2 = await c.query(`SELECT count(*)::int n FROM heartbeat_runs WHERE started_at > NOW() - INTERVAL '90 seconds'`);
console.log("runs in last 90s:", r2.rows[0].n);
await c.end();
