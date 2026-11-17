import type { CV, Mat } from './cv';

interface Deletable {
  delete(): void;
  isDeleted?(): boolean;
}

/**
 * Tracks every OpenCV object created during one processing pass. `release()` runs in a
 * `finally` block, so a thrown error cannot leak WebAssembly memory. Objects moved to a cache
 * with `keep()` leave the scope and are counted separately.
 */
export class MatScope {
  /** OpenCV objects created through any scope and not yet deleted (cached ones excluded). */
  static live = 0;
  private items: Deletable[] = [];
  constructor(readonly cv: CV) {}
  mat(): Mat {
    return this.track(new this.cv.Mat());
  }
  track<T extends Deletable>(item: T): T {
    this.items.push(item);
    MatScope.live++;
    return item;
  }
  /** Removes an object from this scope; the caller becomes responsible for deleting it. */
  keep<T extends Deletable>(item: T): T {
    const index = this.items.indexOf(item);
    if (index >= 0) {
      this.items.splice(index, 1);
      MatScope.live--;
    }
    return item;
  }
  /** Number of objects currently owned by this scope. */
  get size() {
    return this.items.length;
  }
  /** Objects added after the scope had `count` items (the output of one operation). */
  since(count: number): Deletable[] {
    return this.items.slice(count);
  }
  release() {
    for (const item of this.items.splice(0)) {
      if (!item.isDeleted?.()) item.delete();
      MatScope.live--;
    }
  }
}

/** Runs `work` with a fresh scope and always releases it. */
export function withScope<T>(cv: CV, work: (scope: MatScope) => T): T {
  const scope = new MatScope(cv);
  try {
    return work(scope);
  } finally {
    scope.release();
  }
}
