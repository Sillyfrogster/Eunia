import type { Server, ServerWebSocket } from "bun";
import { createDeflate, constants as zlibConstants, type Deflate } from "node:zlib";

import type { GatewayPayload } from "../src/index";

export interface ReceivedFrame {
  op: number;
  d: unknown;
  connection: number;
}

interface ConnState {
  index: number;
  deflate: Deflate;
  deflated: Buffer[];
  ws: ServerWebSocket<ConnState> | null;
}

export class MockGateway {
  private readonly server: Server<ConnState>;
  private readonly conns: ConnState[] = [];
  private readonly queue: ReceivedFrame[] = [];
  private readonly waiters: ((frame: ReceivedFrame) => void)[] = [];

  constructor(private readonly opts: { heartbeatInterval?: number; autoHello?: boolean } = {}) {
    this.server = Bun.serve({
      port: 0,
      fetch: (request, candidate) => {
        const conn: ConnState = {
          index: this.conns.length,
          deflate: createDeflate(),
          deflated: [],
          ws: null,
        };
        if (candidate.upgrade(request, { data: conn })) return undefined;
        return new Response("expected a websocket upgrade", { status: 400 });
      },
      websocket: {
        open: (ws: ServerWebSocket<ConnState>) => {
          ws.data.ws = ws;
          ws.data.deflate.on("data", (chunk: Buffer) => ws.data.deflated.push(chunk));
          this.conns.push(ws.data);
          if (this.opts.autoHello !== false) {
            this.sendTo(ws.data, {
              op: 10,
              d: { heartbeat_interval: this.opts.heartbeatInterval ?? 45_000 },
              s: null,
              t: null,
            });
          }
        },
        message: (ws: ServerWebSocket<ConnState>, message: string | Buffer) => {
          const payload = JSON.parse(String(message)) as GatewayPayload;
          const frame: ReceivedFrame = {
            op: payload.op,
            d: payload.d,
            connection: ws.data.index,
          };
          const waiter = this.waiters.shift();
          if (waiter) waiter(frame);
          else this.queue.push(frame);
        },
        close: () => {},
      },
    });
  }

  get url(): string {
    return `ws://localhost:${this.server.port}`;
  }

  get connectionCount(): number {
    return this.conns.length;
  }

  send(payload: GatewayPayload): void {
    const conn = this.conns.at(-1);
    if (!conn) throw new Error("no connection to send to");
    this.sendTo(conn, payload);
  }

  sendDispatch(t: string, d: unknown, s: number): void {
    this.send({ op: 0, d, s, t });
  }

  closeLatest(code: number, reason = ""): void {
    this.conns.at(-1)?.ws?.close(code, reason);
  }

  next(timeoutMs = 3_000): Promise<ReceivedFrame> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out after ${timeoutMs}ms waiting for a frame`)),
        timeoutMs,
      );
      this.waiters.push((frame) => {
        clearTimeout(timer);
        resolve(frame);
      });
    });
  }

  async nextOfOp(op: number, timeoutMs = 3_000): Promise<ReceivedFrame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timed out waiting for op ${op}`);
      const frame = await this.next(remaining);
      if (frame.op === op) return frame;
    }
  }

  stop(): void {
    this.server.stop(true);
  }

  private sendTo(conn: ConnState, payload: GatewayPayload): void {
    conn.deflate.write(Buffer.from(JSON.stringify(payload)));
    conn.deflate.flush(zlibConstants.Z_SYNC_FLUSH, () => {
      const buf = Buffer.concat(conn.deflated);
      conn.deflated.length = 0;
      conn.ws?.send(buf);
    });
  }
}
