import { useEffect, useRef, useState } from 'react';
import { plates } from '../../../i18n/plates';
import { VisionClient, WorkerError, grabFrame } from '../VisionClient';

const text = plates.perf;
const WIDTHS = [640, 320] as const;
const SECONDS_PER_WIDTH = 6;

export interface WidthResult {
  width: number;
  height: number;
  frames: number;
  fps: number;
  meanMs: number;
  p95Ms: number;
  grabMs: number;
  readMs: number;
  thumbnailsMs: number;
  operations: { name: string; ms: number }[];
  liveMats: number;
}

export interface PerfReport {
  date: string;
  userAgent: string;
  cores: number;
  memoryGb: number | null;
  source: 'camera' | 'pattern';
  openCv: { loadMs: number; bytes: number | null; version: string };
  results: WidthResult[];
  uiMaxGapMs: number;
  verdict: 'good' | 'reduced' | 'bad';
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
const p95 = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ?? 0;

/** Live preview needs at least 10 fps (plan, acceptance criteria). */
export function verdictFor(results: Pick<WidthResult, 'width' | 'fps'>[]): PerfReport['verdict'] {
  const full = results.find((result) => result.width === 640);
  const small = results.find((result) => result.width === 320);
  if (full && full.fps >= 10) return 'good';
  if (small && small.fps >= 10) return 'reduced';
  return 'bad';
}

/** Facilitator page measuring whether a station can run the plate reader smoothly. */
export function PerfTest({ getVideo }: { getVideo: () => HTMLVideoElement | null }) {
  const client = useRef<VisionClient | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'running' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [report, setReport] = useState<PerfReport | null>(null);
  const [copied, setCopied] = useState(false);
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      client.current?.terminate();
    };
  }, []);

  const run = async () => {
    setError('');
    setReport(null);
    setCopied(false);
    setStatus('loading');
    const vision = (client.current ??= new VisionClient());
    try {
      const ready = await vision.init();
      if (cancelled.current) return;
      setStatus('running');
      const video = getVideo();
      const camera = !!video && !!video.srcObject && video.videoWidth > 0;
      let uiMaxGap = 0;
      let last = performance.now();
      let raf = requestAnimationFrame(function tick(now) {
        uiMaxGap = Math.max(uiMaxGap, now - last);
        last = now;
        raf = requestAnimationFrame(tick);
      });
      const results: WidthResult[] = [];
      try {
        for (const width of WIDTHS) {
          const frames: number[] = [];
          const grabs: number[] = [];
          const reads: number[] = [];
          const thumbs: number[] = [];
          const ops = new Map<string, number[]>();
          let size = { width: 0, height: 0 };
          let liveMats = 0;
          // The first (warm-up) pass is not counted: JIT and first allocations.
          let warm = true;
          let begin = performance.now();
          const end = begin + SECONDS_PER_WIDTH * 1000;
          while (performance.now() < end && !cancelled.current) {
            const started = performance.now();
            const bitmap = camera ? await grabFrame(video!, width) : null;
            const grabbed = performance.now();
            const result = await vision.request<'benchmark'>(
              { type: 'benchmark', bitmap: bitmap ?? undefined, width, thumbnails: true },
              bitmap ? [bitmap] : [],
            );
            if (warm) {
              warm = false;
              begin = performance.now();
              continue;
            }
            frames.push(performance.now() - started);
            grabs.push(grabbed - started);
            reads.push(result.readMs);
            thumbs.push(result.thumbnailsMs);
            size = result.size;
            liveMats = result.liveMats;
            for (const op of result.operations)
              ops.set(op.name, [...(ops.get(op.name) ?? []), op.ms]);
          }
          const seconds = (performance.now() - begin) / 1000;
          results.push({
            ...size,
            width,
            frames: frames.length,
            fps: frames.length / seconds,
            meanMs: mean(frames),
            p95Ms: p95(frames),
            grabMs: mean(grabs),
            readMs: mean(reads),
            thumbnailsMs: mean(thumbs),
            operations: [...ops].map(([name, values]) => ({ name, ms: mean(values) })),
            liveMats,
          });
        }
      } finally {
        cancelAnimationFrame(raf);
      }
      if (cancelled.current) return;
      const nav = navigator as Navigator & { deviceMemory?: number };
      setReport({
        date: new Date().toISOString(),
        userAgent: navigator.userAgent,
        cores: navigator.hardwareConcurrency,
        memoryGb: nav.deviceMemory ?? null,
        source: camera ? 'camera' : 'pattern',
        openCv: { loadMs: ready.loadMs, bytes: ready.openCvBytes, version: ready.version },
        results,
        uiMaxGapMs: uiMaxGap,
        verdict: verdictFor(results),
      });
      setStatus('done');
    } catch (failure) {
      if (cancelled.current) return;
      setError(failure instanceof WorkerError && failure.csp ? text.csp : text.failed);
      console.error('[plates:perf]', failure);
      setStatus('error');
    }
  };

  const busy = status === 'loading' || status === 'running';
  const label = busy
    ? status === 'loading'
      ? text.loading
      : text.running
    : report
      ? text.again
      : text.start;
  return (
    <div className="perf-test">
      <p>{text.intro}</p>
      <div className="actions">
        <button className="primary" disabled={busy} onClick={() => void run()}>
          {label}
        </button>
        {report && (
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(JSON.stringify(report, null, 2));
              setCopied(true);
            }}
          >
            {copied ? text.copied : text.copy}
          </button>
        )}
      </div>
      {busy && <progress aria-label={text.running} />}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <div className="perf-report" data-verdict={report.verdict}>
          <p className="perf-verdict" role="status">
            {report.verdict === 'good'
              ? text.verdictGood
              : report.verdict === 'reduced'
                ? text.verdictReduced
                : text.verdictBad}
          </p>
          <dl className="diagnostics">
            <dt>{text.source}</dt>
            <dd>{report.source === 'camera' ? text.camera : text.pattern}</dd>
            <dt>{text.version}</dt>
            <dd>{report.openCv.version}</dd>
            <dt>{text.load}</dt>
            <dd>{report.openCv.loadMs.toFixed(0)} ms</dd>
            <dt>{text.size}</dt>
            <dd>
              {report.openCv.bytes ? (report.openCv.bytes / 1024 / 1024).toFixed(1) + ' MB' : '–'}
            </dd>
            <dt>{text.ui}</dt>
            <dd>{report.uiMaxGapMs.toFixed(0)} ms</dd>
          </dl>
          <table className="perf-table">
            <thead>
              <tr>
                <th>{text.width}</th>
                {report.results.map((result) => (
                  <th key={result.width}>
                    {result.width} × {result.height}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>{text.fps}</th>
                {report.results.map((r) => (
                  <td key={r.width} data-testid={`fps-${r.width}`}>
                    {r.fps.toFixed(1)}
                  </td>
                ))}
              </tr>
              <tr>
                <th>{text.frame}</th>
                {report.results.map((r) => (
                  <td key={r.width}>
                    {r.meanMs.toFixed(1)} / {r.p95Ms.toFixed(1)} ms
                  </td>
                ))}
              </tr>
              <tr>
                <th>{text.grab}</th>
                {report.results.map((r) => (
                  <td key={r.width}>{r.grabMs.toFixed(1)} ms</td>
                ))}
              </tr>
              <tr>
                <th>{text.read}</th>
                {report.results.map((r) => (
                  <td key={r.width}>{r.readMs.toFixed(1)} ms</td>
                ))}
              </tr>
              {report.results[0]?.operations.map((op, index) => (
                <tr key={op.name}>
                  <th>{op.name}</th>
                  {report.results.map((r) => (
                    <td key={r.width}>{(r.operations[index]?.ms ?? 0).toFixed(2)} ms</td>
                  ))}
                </tr>
              ))}
              <tr>
                <th>{text.thumbs}</th>
                {report.results.map((r) => (
                  <td key={r.width}>{r.thumbnailsMs.toFixed(1)} ms</td>
                ))}
              </tr>
              <tr>
                <th>{text.mats}</th>
                {report.results.map((r) => (
                  <td key={r.width} data-testid={`mats-${r.width}`}>
                    {r.liveMats}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="note">{text.note}</p>
    </div>
  );
}
