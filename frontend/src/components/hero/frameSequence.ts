// Image-sequence controller for the scroll-driven hero.
// Frames are loaded on demand around the current position, plus a sparse "keyframe" pass so that
// fast scrubbing always has a nearby frame to draw. Far-away frames are released to cap memory.

export interface HeroManifest {
  frameCount: number;
  indexPad: number;
  poster: string;
  sets: Record<"desktop" | "mobile", { width: number; height: number; pattern: string }>;
  zones: { id: string; title: string; firstFrame: number; lastFrame: number }[];
}

const WINDOW = 14;        // frames preloaded on each side of the current one
const KEEP = 48;          // frames kept decoded on each side (others released)
const KEYFRAME_STEP = 8;  // sparse pass so scrubbing never shows a blank canvas
const CONCURRENCY = 6;

export class FrameSequence {
  private images = new Map<number, HTMLImageElement>();
  private loading = new Set<number>();
  private queue: number[] = [];
  private active = 0;
  private disposed = false;
  onFrameReady: (index: number) => void = () => {};

  constructor(private manifest: HeroManifest, private set: "desktop" | "mobile") {}

  get count() { return this.manifest.frameCount; }

  url(i: number) {
    const n = String(i + 1).padStart(this.manifest.indexPad, "0");
    return this.manifest.sets[this.set].pattern.replace("{index}", n);
  }

  /** Start with the first frames and the sparse keyframes. */
  start() {
    const first = Array.from({ length: Math.min(WINDOW, this.count) }, (_, i) => i);
    const keys = Array.from({ length: Math.ceil(this.count / KEYFRAME_STEP) }, (_, i) => i * KEYFRAME_STEP);
    this.enqueue([...first, ...keys]);
  }

  /** Prioritise frames near `center`, release far ones. */
  focus(center: number) {
    const near: number[] = [];
    for (let d = 0; d <= WINDOW; d++) {
      if (center + d < this.count) near.push(center + d);
      if (d && center - d >= 0) near.push(center - d);
    }
    this.queue = this.queue.filter((i) => Math.abs(i - center) <= WINDOW * 3);
    this.enqueue(near, true);
    for (const i of [...this.images.keys()]) {
      if (Math.abs(i - center) > KEEP && i % KEYFRAME_STEP !== 0) {
        const img = this.images.get(i)!;
        img.src = "";
        this.images.delete(i);
      }
    }
  }

  has(i: number) { return this.images.has(i); }

  /** The requested frame if loaded, otherwise the closest loaded one. */
  nearest(i: number): HTMLImageElement | null {
    const exact = this.images.get(i);
    if (exact) return exact;
    for (let d = 1; d < this.count; d++) {
      const a = this.images.get(i - d) ?? this.images.get(i + d);
      if (a) return a;
    }
    return null;
  }

  dispose() {
    this.disposed = true;
    this.queue = [];
    this.images.forEach((img) => { img.src = ""; });
    this.images.clear();
  }

  private enqueue(list: number[], front = false) {
    const fresh = list.filter((i) => !this.images.has(i) && !this.loading.has(i));
    const rest = this.queue.filter((i) => !fresh.includes(i));
    this.queue = front ? [...fresh, ...rest] : [...rest, ...fresh];
    this.pump();
  }

  private pump() {
    while (!this.disposed && this.active < CONCURRENCY && this.queue.length) {
      const i = this.queue.shift()!;
      if (this.images.has(i) || this.loading.has(i)) continue;
      this.load(i);
    }
  }

  private load(i: number) {
    this.active++;
    this.loading.add(i);
    const img = new Image();
    img.decoding = "async";
    img.onload = async () => {
      try { await img.decode?.(); } catch { /* drawn anyway */ }
      this.finish(i);
      if (!this.disposed) { this.images.set(i, img); this.onFrameReady(i); }
    };
    img.onerror = () => this.finish(i);
    img.src = this.url(i);
  }

  private finish(i: number) {
    this.active--;
    this.loading.delete(i);
    this.pump();
  }
}
