import { createLogger, type Logger } from "@eunia/shared";
import { ZlibStreamInflator } from "./compression";
import { GATEWAY_VERSION } from "./constants";
import type { GatewayPayload } from "./types";

/**
 * Callbacks a GatewayConnection reports through. `onStreamError` means the
 * zlib stream is corrupted and the connection must be replaced.
 */
export interface GatewayConnectionHandlers {
  onOpen(): void;
  onPayload(payload: GatewayPayload): void;
  onClose(code: number, reason: string): void;
  onStreamError(error: Error): void;
}

/**
 * The transport of one gateway connection. Owns the WebSocket and the zlib
 * stream, turns incoming frames into parsed payloads, and writes outgoing ones.
 *
 * Session logic lives in the Shard, which replaces the whole connection rather
 * than repairing it.
 */
export class GatewayConnection {
  private readonly log: Logger;
  private readonly socket: WebSocket;
  private readonly inflator: ZlibStreamInflator;

  constructor(
    baseUrl: string,
    handlers: GatewayConnectionHandlers,
    logger: Logger = createLogger("gateway"),
  ) {
    this.log = logger;
    this.inflator = new ZlibStreamInflator(
      (json) => this.deliver(json, handlers),
      (error) => handlers.onStreamError(error),
    );

    this.socket = new WebSocket(
      `${baseUrl}?v=${GATEWAY_VERSION}&encoding=json&compress=zlib-stream`,
    );
    // With zlib-stream every incoming frame is binary.
    this.socket.binaryType = "arraybuffer";

    this.socket.addEventListener("open", () => handlers.onOpen());
    this.socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        this.deliver(event.data, handlers);
        return;
      }
      this.inflator.push(Buffer.from(event.data as ArrayBuffer));
    });
    this.socket.addEventListener("close", (event) => {
      handlers.onClose(event.code, event.reason);
    });
    this.socket.addEventListener("error", () => {
      // The close event that follows carries the code and reason.
    });
  }

  get isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }

  /** Writes one payload to the socket. */
  send(payload: Omit<GatewayPayload, "s" | "t">): void {
    const encoded = JSON.stringify(payload);
    if (Buffer.byteLength(encoded) > 4_096) {
      throw new RangeError("Gateway payloads cannot exceed 4096 bytes.");
    }
    this.socket.send(encoded);
  }

  /**
   * Asks the socket to close.
   *
   * On a dead network the close handshake may never complete, so the caller
   * owns the deadline.
   */
  close(code: number, reason: string): void {
    try {
      this.socket.close(code, reason);
    } catch {
      // Closing an already-broken socket throws. The caller's force timer covers it.
    }
  }

  /** Tears down the zlib stream. Call once the connection is finished. */
  destroy(): void {
    this.inflator.destroy();
  }

  private deliver(json: string, handlers: GatewayConnectionHandlers): void {
    let payload: GatewayPayload;
    try {
      payload = JSON.parse(json) as GatewayPayload;
    } catch {
      this.log.error("received unparseable frame:", json.slice(0, 200));
      return;
    }
    handlers.onPayload(payload);
  }
}
