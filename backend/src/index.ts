import { Hono } from "hono";
import { websocket } from "hono/bun";
import { env } from "./env";
import { loadPartitions } from "./partitions/loadPartitions";
import { createRuntimeState, publicState } from "./state";
import { registerWebSocket } from "./websocket";

const scores = await loadPartitions();
const state = createRuntimeState(scores, env.groupSize);
const app = new Hono();

registerWebSocket(app, state);

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    serverNowMs: Date.now()
  })
);

app.get("/api/scores", (c) =>
  c.json({
    groupScores: Array.from(state.groupScores.values()),
    globalScore: state.globalScore
  })
);

app.get("/api/partitions", (c) => c.json(scores));
app.get("/api/state", (c) => c.json(publicState(state)));

const server = Bun.serve({
  port: env.port,
  fetch: app.fetch,
  websocket
});

console.info(`Backend listening on http://${server.hostname}:${server.port}`);

export { app, state };
