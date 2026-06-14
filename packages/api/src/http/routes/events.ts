// /events/:id — Server-Sent Events stream of a position's timeline. Replays the
// existing events, then pushes live ones as transitions/notes happen.

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { PositionService } from "../../core/services/position.js";
import type { PositionEvent } from "../../core/domain/position.js";
import { sendError } from "../errors.js";

export function eventsRoutes(positions: PositionService): Hono {
  const app = new Hono();

  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const exists = positions.get(id);
    if (!exists.ok) return sendError(c, exists.error);

    return streamSSE(c, async (stream) => {
      const send = (ev: PositionEvent) =>
        stream.writeSSE({ event: ev.type, id: ev.id, data: JSON.stringify(ev) });

      // Replay the history so a late subscriber still sees the full timeline.
      for (const ev of positions.events(id)) await send(ev);

      // Then stream live events until the client disconnects.
      let done = false;
      const unsubscribe = positions.subscribe(id, (ev) => {
        void send(ev).catch(() => {
          done = true;
        });
      });
      stream.onAbort(() => {
        done = true;
      });
      try {
        // Heartbeat doubles as a disconnect probe: once the client is gone,
        // writeSSE throws and we exit (onAbort isn't reliable in-process).
        while (!done && !stream.aborted) {
          await stream.sleep(1_000);
          try {
            await stream.writeSSE({ event: "ping", data: "{}" });
          } catch {
            done = true;
          }
        }
      } finally {
        unsubscribe();
      }
    });
  });

  return app;
}
