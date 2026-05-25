const MAX_ENTRIES = 5;
const MAX_TOTAL_BYTES = 2_500;
const MSG_MAX = 256;
const STACK_MAX = 512;
const KIND_MAX = 64;

export type ErrorRingEntry = {
  ts: number;
  kind: string;
  message: string;
  stackHead?: string;
};

export class ErrorRingBuffer {
  private entries: ErrorRingEntry[] = [];

  push(entry: ErrorRingEntry): void {
    const truncated: ErrorRingEntry = {
      ts: entry.ts,
      kind: (entry.kind ?? '').slice(0, KIND_MAX),
      message: (entry.message ?? '').slice(0, MSG_MAX),
      stackHead: entry.stackHead ? entry.stackHead.slice(0, STACK_MAX) : undefined
    };
    this.entries.push(truncated);
    while (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
    }
    while (this.totalBytes() > MAX_TOTAL_BYTES && this.entries.length > 0) {
      this.entries.shift();
    }
  }

  snapshot(): ErrorRingEntry[] {
    return this.entries.slice();
  }

  clear(): void {
    this.entries = [];
  }

  private totalBytes(): number {
    return this.entries.reduce(
      (acc, e) => acc + e.message.length + (e.stackHead?.length ?? 0),
      0
    );
  }
}

export const errorRing = new ErrorRingBuffer();
