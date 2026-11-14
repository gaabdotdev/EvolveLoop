/**
 * Length-prefixed JSON framing (u32be + UTF-8 JSON). ADR-V37-0002.
 */

import { Buffer } from "node:buffer";

export const MAX_FRAME_BYTES = 16 * 1024 * 1024; // 16 MiB hard limit

export function encodeFrame(obj: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  if (body.length > MAX_FRAME_BYTES) {
    throw new Error(`frame_too_large:${body.length}`);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

export class FrameDecoder {
  private buf = Buffer.alloc(0);
  private frames = 0;

  push(chunk: Buffer): unknown[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out: unknown[] = [];
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32BE(0);
      if (len > MAX_FRAME_BYTES) {
        throw new Error(`frame_too_large:${len}`);
      }
      if (this.buf.length < 4 + len) break;
      const body = this.buf.subarray(4, 4 + len);
      this.buf = this.buf.subarray(4 + len);
      out.push(JSON.parse(body.toString("utf8")));
      this.frames += 1;
    }
    return out;
  }

  get decodedCount(): number {
    return this.frames;
  }
}
