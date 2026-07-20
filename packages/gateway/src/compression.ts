import { createInflate, constants as zlibConstants } from "node:zlib";

/** Marks the end of a complete payload in the stream. */
const FLUSH_MARKER = Buffer.from([0x00, 0x00, 0xff, 0xff]);

/**
 * Decompresses a gateway connection opened with `?compress=zlib-stream`.
 *
 * The whole connection is one continuous zlib stream, so this inflater must
 * live as long as the connection and receive every byte in order. A payload
 * is complete once a message ends with the flush marker.
 */
export class ZlibStreamInflator {
  private readonly inflate = createInflate();

  /** Inflated chunks accumulated since the last complete payload. */
  private inflated: Buffer[] = [];

  /**
   * @param onPayload Receives the decompressed JSON text of each complete payload.
   * @param onError Fires when the stream is corrupted; the connection must be replaced.
   */
  constructor(
    private readonly onPayload: (json: string) => void,
    private readonly onError: (error: Error) => void,
  ) {
    this.inflate.on("data", (chunk: Buffer) => this.inflated.push(chunk));
    this.inflate.on("error", (error: Error) => this.onError(error));
  }

  /** Feeds one compressed WebSocket message into the stream. */
  push(chunk: Buffer): void {
    this.inflate.write(chunk);

    if (!this.endsWithFlushMarker(chunk)) return;

    // The flush callback runs after all pending data events.
    this.inflate.flush(zlibConstants.Z_SYNC_FLUSH, () => {
      if (this.inflated.length === 0) return;
      const json = Buffer.concat(this.inflated).toString("utf8");
      this.inflated = [];
      this.onPayload(json);
    });
  }

  /** Tears down the inflater. A new connection needs a new instance. */
  destroy(): void {
    this.inflate.destroy();
    this.inflated = [];
  }

  private endsWithFlushMarker(chunk: Buffer): boolean {
    if (chunk.length < FLUSH_MARKER.length) return false;
    return chunk.subarray(chunk.length - FLUSH_MARKER.length).equals(FLUSH_MARKER);
  }
}
