type TF = typeof import('./tfApi');

/**
 * TensorFlow.js (~900 KB) is loaded only when the gesture part needs it, so a station that
 * only runs the plate reader never downloads it. `loadTf()` is awaited in
 * `FeatureExtractor.load()`; every other TFJS user runs after that and uses `tfjs()`.
 */
let module: TF | null = null;
let loading: Promise<TF> | null = null;

export function loadTf(): Promise<TF> {
  loading ??= import('./tfApi').then(
    (loaded) => (module = loaded),
    (error) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/** The loaded TensorFlow.js module; throws if `loadTf()` has not finished yet. */
export function tfjs(): TF {
  if (!module) throw new Error('TensorFlow.js is not loaded');
  return module;
}

/** The module if it is already loaded (diagnostics), without loading it. */
export const loadedTf = (): TF | null => module;
