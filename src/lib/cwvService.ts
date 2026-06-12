import { Company } from '@/models/Company';
import { CWVRecord } from '@/models/CWVRecord';
import dbConnect from './mongoose';

// Reuse PAGESPEED_API_KEY if CRUX_API_KEY is not set (same GCP key works once CrUX API is enabled)
const CRUX_API_KEY =
  process.env.CRUX_API_KEY?.trim() ||
  process.env.PAGESPEED_API_KEY?.trim() ||
  undefined;

// CrUX quota: 150 req/min → ~400ms spacing is safe
const CRUX_REQUEST_DELAY_MS = CRUX_API_KEY
  ? Number(process.env.CRUX_REQUEST_DELAY_MS ?? 400)
  : 10000;

const CRUX_API_URL = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

export function getTodayDateStr() {
  return new Date().toISOString().split('T')[0];
}

type FormFactor = 'PHONE' | 'DESKTOP';
type Strategy = 'mobile' | 'desktop';

interface CruxMetric {
  percentiles?: { p75?: number | string };
}

interface CruxRecord {
  key?: { url?: string; origin?: string; formFactor?: FormFactor };
  metrics?: Record<string, CruxMetric>;
}

interface CruxResponse {
  record?: CruxRecord;
  urlNormalizationDetails?: { originalUrl?: string; normalizedUrl?: string };
  error?: { code?: number; message?: string; status?: string };
}

export interface CWVFetchOptions {
  urls?: string[];
  force?: boolean;
  date?: string;
}

export interface CWVFetchResult {
  fetched: number;
  skipped: number;
  failed: number;
}

function strategyToFormFactor(strategy: Strategy): FormFactor {
  return strategy === 'mobile' ? 'PHONE' : 'DESKTOP';
}

function parseP75(metric?: CruxMetric): number | null {
  const p75 = metric?.percentiles?.p75;
  if (p75 === undefined || p75 === null) return null;
  const n = typeof p75 === 'string' ? parseFloat(p75) : p75;
  return Number.isFinite(n) ? n : null;
}

type CWVStatus = 'Pass' | 'Fail' | 'Unknown';

function statusFromMetrics(metrics: Record<string, CruxMetric>): CWVStatus {
  const lcp = parseP75(metrics.largest_contentful_paint);
  const cls = parseP75(metrics.cumulative_layout_shift);
  const inp = parseP75(metrics.interaction_to_next_paint);
  if (lcp === null || cls === null) return 'Unknown';
  const lcpPass = lcp <= 2500;
  const clsPass = cls <= 0.1;
  const inpPass = inp !== null ? inp <= 200 : true;
  return lcpPass && clsPass && inpPass ? 'Pass' : 'Fail';
}

function metricsFromRecord(record: CruxRecord | null) {
  return record?.metrics ?? {};
}

// Per-run cache so 130 URLs on same origin only hit CrUX once for origin data
const originQueryCache = new Map<string, Promise<{ record: CruxRecord | null; apiDurationMs: number }>>();

function clearOriginQueryCache() {
  originQueryCache.clear();
}

async function queryOriginCached(origin: string, formFactor: FormFactor) {
  const key = `${origin}|${formFactor}`;
  if (!originQueryCache.has(key)) {
    originQueryCache.set(key, queryCruxRecord({ origin, formFactor }));
  }
  return originQueryCache.get(key)!;
}

async function queryCruxRecord(
  body: { url: string; formFactor: FormFactor } | { origin: string; formFactor: FormFactor }
): Promise<{ record: CruxRecord | null; apiDurationMs: number }> {
  const apiStart = Date.now();
  const response = await fetch(`${CRUX_API_URL}?key=${CRUX_API_KEY}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...body,
      metrics: [
        'largest_contentful_paint',
        'first_contentful_paint',
        'cumulative_layout_shift',
        'interaction_to_next_paint',
      ],
    }),
  });

  const data: CruxResponse = await response.json();
  const apiDurationMs = Date.now() - apiStart;

  if (response.status === 429) throw new Error('429');
  if (response.status === 403 && data.error?.status === 'PERMISSION_DENIED') {
    throw new Error(
      'CrUX API is not enabled for this API key. Enable "Chrome UX Report API" in Google Cloud Console.'
    );
  }
  if (response.status === 404 || data.error?.status === 'NOT_FOUND') {
    return { record: null, apiDurationMs };
  }
  if (!response.ok) {
    throw new Error(
      `CrUX API error for ${JSON.stringify(body)}: ${data.error?.message ?? response.statusText}`
    );
  }

  return { record: data.record ?? null, apiDurationMs };
}

async function fetchCruxData(url: string, strategy: Strategy) {
  const formFactor = strategyToFormFactor(strategy);
  const origin = new URL(url).origin;

  const urlResult = await queryCruxRecord({ url, formFactor });
  const originResult = await queryOriginCached(origin, formFactor);
  let apiDurationMs = urlResult.apiDurationMs + originResult.apiDurationMs;

  let record = urlResult.record;
  let isOriginFallback = false;

  if (!record) {
    record = originResult.record;
    isOriginFallback = !!record;
  }

  const metrics = metricsFromRecord(record);
  const originMetrics = metricsFromRecord(originResult.record);

  const lcp = parseP75(metrics.largest_contentful_paint);
  const fcp = parseP75(metrics.first_contentful_paint);
  const cls = parseP75(metrics.cumulative_layout_shift);
  const inp = parseP75(metrics.interaction_to_next_paint);
  const status = statusFromMetrics(metrics);
  const originStatus = statusFromMetrics(originMetrics);

  return { lcp, fcp, cls, inp, status, isOriginFallback, originStatus, apiDurationMs };
}

async function saveCWVRecord(
  url: string,
  dateStr: string,
  strategy: Strategy,
  metrics: Awaited<ReturnType<typeof fetchCruxData>>
) {
  await CWVRecord.findOneAndUpdate(
    { url, date: dateStr, device: strategy },
    {
      url,
      date: dateStr,
      device: strategy,
      fcp: metrics.fcp,
      lcp: metrics.lcp,
      cls: metrics.cls,
      inp: metrics.inp,
      status: metrics.status,
      isOriginFallback: metrics.isOriginFallback,
      originStatus: metrics.originStatus,
    },
    { upsert: true, returnDocument: 'after' }
  );
}

async function fetchUrlStrategy(
  url: string,
  strategy: Strategy,
  dateStr: string,
  force: boolean
): Promise<'fetched' | 'skipped' | 'failed'> {
  if (!force) {
    const existing = await CWVRecord.findOne({ url, date: dateStr, device: strategy }).lean();
    if (existing) {
      console.log(`[CWV] Skipping ${strategy} ${url} — already fetched for ${dateStr}`);
      return 'skipped';
    }
  }

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    const callStart = Date.now();
    try {
      console.log(`[CWV] Fetching ${strategy} for ${url}...`);
      const metrics = await fetchCruxData(url, strategy);

      const saveStart = Date.now();
      await saveCWVRecord(url, dateStr, strategy, metrics);
      const saveDurationMs = Date.now() - saveStart;

      const throttleStart = Date.now();
      await sleep(CRUX_REQUEST_DELAY_MS);
      const throttleDurationMs = Date.now() - throttleStart;
      const totalDurationMs = Date.now() - callStart;

      console.log(
        `[CWV] ${strategy} ${url} — ` +
        `API: ${formatSeconds(metrics.apiDurationMs)}, ` +
        `save: ${formatSeconds(saveDurationMs)}, ` +
        `throttle: ${formatSeconds(throttleDurationMs)}, ` +
        `total: ${formatSeconds(totalDurationMs)}`
      );
      return 'fetched';
    } catch (error: unknown) {
      attempts++;
      const elapsedMs = Date.now() - callStart;
      const message = error instanceof Error ? error.message : String(error);
      if (message === '429') {
        const backoffMs = 15000 * attempts;
        console.warn(
          `[CWV] 429 rate limit for ${url} (${strategy}) after ${formatSeconds(elapsedMs)} — ` +
          `retry ${attempts}/${maxAttempts}, waiting ${formatSeconds(backoffMs)}`
        );
        await sleep(backoffMs);
      } else {
        console.error(
          `[CWV] Error for ${url} (${strategy}) after ${formatSeconds(elapsedMs)}:`,
          error
        );
        return 'failed';
      }
    }
  }
  return 'failed';
}

export async function runCWVFetch(options: CWVFetchOptions = {}): Promise<CWVFetchResult> {
  await dbConnect();

  const dateStr = options.date ?? getTodayDateStr();
  const force = options.force ?? false;
  const result: CWVFetchResult = { fetched: 0, skipped: 0, failed: 0 };

  let urls: string[];
  if (options.urls?.length) {
    urls = options.urls;
  } else {
    const companies = await Company.find({});
    urls = companies.flatMap(c => c.urls);
  }

  const uniqueUrls = [...new Set(urls)];
  clearOriginQueryCache();

  console.log(
    `[CWV] Starting fetch — CrUX API key: ${CRUX_API_KEY ? 'set' : 'none'}, ` +
    `date: ${dateStr}, urls: ${uniqueUrls.length}, force: ${force}, ` +
    `throttle: ${formatSeconds(CRUX_REQUEST_DELAY_MS)} after each call`
  );

  const strategies: Strategy[] = ['mobile', 'desktop'];

  for (const url of uniqueUrls) {
    for (const strategy of strategies) {
      const outcome = await fetchUrlStrategy(url, strategy, dateStr, force);
      result[outcome]++;
    }
  }

  console.log(
    `[CWV] Fetch completed — fetched: ${result.fetched}, skipped: ${result.skipped}, failed: ${result.failed}`
  );
  return result;
}

/** @deprecated Use runCWVFetch instead */
export async function runDailyCWVFetch() {
  return runCWVFetch({ force: false });
}
