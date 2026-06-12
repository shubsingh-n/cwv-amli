"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import styles from './page.module.css';

interface Company {
  _id: string;
  name: string;
  urls: string[];
}

interface CWVRecord {
  _id: string;
  url: string;
  date: string;
  device: 'mobile' | 'desktop';
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  status: 'Pass' | 'Fail' | 'Unknown';
  isOriginFallback: boolean;
  originStatus?: 'Pass' | 'Fail' | 'Unknown';
}

const thresholds = {
  fcp:  { good: 1800,  ni: 3000 },
  lcp:  { good: 2500,  ni: 4000 },
  inp:  { good: 200,   ni: 500  },
  cls:  { good: 0.1,   ni: 0.25 },
};

type MetricKey = 'fcp' | 'lcp' | 'inp' | 'cls';
type Device = 'mobile' | 'desktop';
type StatusFilter = 'all' | 'pass' | 'fail';
type SourceFilter = 'all' | 'origin' | 'traffic';
type SortDirection = 'asc' | 'desc';

type SortKey =
  | 'url'
  | `${string}-${Device}-${MetricKey}`
  | `${string}-${Device}-status`;

function getMetricClass(key: MetricKey, val: number | null, s: typeof styles): string {
  if (val === null) return '';
  const t = thresholds[key];
  if (val <= t.good) return s.metricGood;
  if (val <= t.ni)   return s.metricNeedsImprovement;
  return s.metricPoor;
}

function statusOrder(status: CWVRecord['status'] | undefined): number {
  if (status === 'Pass') return 0;
  if (status === 'Fail') return 1;
  if (status === 'Unknown') return 2;
  return 3;
}

function formatPct(pass: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((pass / total) * 100)}%`;
}

interface GoodUrlStats {
  originPass: number;
  totalUrls: number;
  directPass: number;
  directTotal: number;
}

function computeGoodUrlStats(
  urls: string[],
  date: string,
  device: Device,
  dataMap: Record<string, Record<string, Record<string, CWVRecord>>>
): GoodUrlStats {
  // Good URL (Origin): any passed URL / all URLs in tab (denominator is full list, not origin-only)
  let originPass = 0;
  let directPass = 0;
  let directTotal = 0;

  for (const url of urls) {
    const r = dataMap[url]?.[date]?.[device];
    if (r?.status === 'Pass') originPass++;
    if (!r || r.isOriginFallback) continue;
    directTotal++;
    if (r.status === 'Pass') directPass++;
  }

  return { originPass, totalUrls: urls.length, directPass, directTotal };
}

export default function Dashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [records, setRecords] = useState<CWVRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('');
  const [fetchStatus, setFetchStatus] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; url: string } | null>(null);
  const [fetchingUrls, setFetchingUrls] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      if (data.success) {
        setCompanies(data.companies);
        setRecords(data.records);
        setActiveTab(prev => {
          if (prev) return prev;
          return data.companies.length > 0 ? data.companies[0].name : '';
        });
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const closeMenu = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  const triggerFetch = async (urls?: string[], force = false) => {
    const label = urls?.length === 1
      ? `Fetching ${urls[0]}...`
      : force
        ? 'Re-fetching all URLs...'
        : 'Fetching missing URLs only...';

    setFetchStatus(label);
    if (urls?.length) {
      setFetchingUrls(prev => new Set([...prev, ...urls]));
    }

    try {
      await fetch('/api/fetch-cwv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, force }),
      });
      setFetchStatus(
        urls?.length === 1
          ? 'Fetch running — refresh in a few seconds'
          : force
            ? 'Re-fetch running in background — refresh when done'
            : 'Fetch running (skips today\'s existing data) — refresh when done'
      );
      setTimeout(() => fetchData(), urls?.length === 1 ? 5000 : 15000);
    } catch {
      setFetchStatus('Fetch failed to start');
    }

    setTimeout(() => {
      setFetchStatus('');
      if (urls?.length) {
        setFetchingUrls(prev => {
          const next = new Set(prev);
          urls.forEach(u => next.delete(u));
          return next;
        });
      }
    }, 10000);
  };

  const handleFetchCWV = () => triggerFetch(undefined, false);

  const handleUrlContextMenu = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, url });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const activeCompany = companies.find(c => c.name === activeTab);

  const uniqueDates = useMemo(() => {
    const dates = new Set(records.map(r => r.date));
    return Array.from(dates).sort().reverse();
  }, [records]);

  const latestDate = uniqueDates[0] ?? '';

  const dataMap = useMemo(() => {
    const map: Record<string, Record<string, Record<string, CWVRecord>>> = {};
    records.forEach(r => {
      if (!map[r.url]) map[r.url] = {};
      if (!map[r.url][r.date]) map[r.url][r.date] = {};
      map[r.url][r.date][r.device] = r;
    });
    return map;
  }, [records]);

  const getSortValue = useCallback((url: string, key: SortKey): number | string => {
    if (key === 'url') return url;

    const match = key.match(/^(.+)-(mobile|desktop)-(fcp|lcp|cls|inp|status)$/);
    if (!match) return '';

    const [, date, device, field] = match;
    const r = dataMap[url]?.[date]?.[device as Device];
    if (!r) return field === 'status' ? 99 : Infinity;

    if (field === 'status') return statusOrder(r.status);
    return r[field as MetricKey] ?? Infinity;
  }, [dataMap]);

  const displayUrls = useMemo(() => {
    if (!activeCompany) return [];

    let urls = [...activeCompany.urls];

    if (latestDate) {
      if (statusFilter !== 'all') {
        urls = urls.filter(url => {
          const status = dataMap[url]?.[latestDate]?.mobile?.status;
          if (statusFilter === 'pass') return status === 'Pass';
          return status !== 'Pass';
        });
      }

      if (sourceFilter !== 'all') {
        urls = urls.filter(url => {
          const r = dataMap[url]?.[latestDate]?.mobile;
          if (!r) return false;
          if (sourceFilter === 'origin') return r.isOriginFallback;
          return !r.isOriginFallback;
        });
      }
    }

    if (sortKey) {
      urls.sort((a, b) => {
        const av = getSortValue(a, sortKey);
        const bv = getSortValue(b, sortKey);
        let cmp = 0;
        if (typeof av === 'string' && typeof bv === 'string') {
          cmp = av.localeCompare(bv);
        } else {
          cmp = (av as number) - (bv as number);
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return urls;
  }, [activeCompany, statusFilter, sourceFilter, latestDate, dataMap, sortKey, sortDir, getSortValue]);

  const fmt = (val: number | null, key: MetricKey): string => {
    if (val === null) return '—';
    if (key === 'cls') return val.toFixed(3);
    return `${val}ms`;
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const METRICS: MetricKey[] = ['fcp', 'lcp', 'cls', 'inp'];
  const DEVICES: Device[] = ['mobile', 'desktop'];
  const COLS_PER_DEVICE = 5;
  const COLS_PER_DATE = DEVICES.length * COLS_PER_DEVICE;
  const METRIC_LABELS = ['FCP', 'LCP', 'CLS', 'INP', 'Status'] as const;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>CWV Tracker</h1>
        <div className={styles.actions}>
          {fetchStatus && <span className={styles.fetchStatus}>{fetchStatus}</span>}
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleFetchCWV} title="Fetches only URLs missing data for today">
            Fetch Today&apos;s CWV
          </button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={fetchData}>
            Refresh
          </button>
        </div>
      </header>

      {loading ? (
        <div className={styles.loading}>
          <div className={styles.loader}></div> Loading Dashboard...
        </div>
      ) : companies.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>No Data Found</h2>
          <p>Ensure MongoDB is connected and URLs are seeded.</p>
        </div>
      ) : (
        <div>
          <div className={styles.tabsContainer}>
            {companies.map(company => (
              <button
                key={company.name}
                className={`${styles.tab} ${activeTab === company.name ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(company.name)}
              >
                {company.name}
              </button>
            ))}
          </div>

          <div className={styles.contentArea}>
            {activeCompany && (
              <>
                <div className={styles.toolbar}>
                  <span className={styles.toolbarLabel}>Status (mobile):</span>
                  {(['all', 'pass', 'fail'] as StatusFilter[]).map(f => (
                    <button
                      key={f}
                      className={`${styles.filterBtn} ${statusFilter === f ? styles.filterBtnActive : ''} ${
                        f === 'pass' ? styles.filterPass : f === 'fail' ? styles.filterFail : ''
                      }`}
                      onClick={() => setStatusFilter(f)}
                    >
                      {f === 'all' ? 'All' : f === 'pass' ? 'Passed' : 'Failed'}
                    </button>
                  ))}
                  <span className={styles.toolbarDivider}>|</span>
                  <span className={styles.toolbarLabel}>Source (mobile):</span>
                  {(['all', 'origin', 'traffic'] as SourceFilter[]).map(f => (
                    <button
                      key={f}
                      className={`${styles.filterBtn} ${sourceFilter === f ? styles.filterBtnActive : ''} ${
                        f === 'origin' ? styles.filterOrigin : f === 'traffic' ? styles.filterTraffic : ''
                      }`}
                      onClick={() => setSourceFilter(f)}
                    >
                      {f === 'all' ? 'All' : f === 'origin' ? 'Origin' : 'Traffic'}
                    </button>
                  ))}
                  <span className={styles.toolbarHint}>
                    {displayUrls.length} / {activeCompany.urls.length} URLs
                    {latestDate ? ` · latest: ${latestDate}` : ''}
                  </span>
                  <span className={styles.toolbarHint}>
                    Right-click a URL to fetch it individually
                  </span>
                </div>

                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th rowSpan={4} className={styles.seqHeader}>#</th>
                        <th
                          rowSpan={4}
                          className={`${styles.urlHeader} ${styles.sortableHeader}`}
                          onClick={() => handleSort('url')}
                        >
                          URL{sortIndicator('url')}
                        </th>
                        {uniqueDates.map(date => (
                          <th key={date} colSpan={COLS_PER_DATE} className={styles.dateHeader}>
                            {date}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {uniqueDates.map(date =>
                          DEVICES.map(device => (
                            <th key={`${date}-${device}`} colSpan={COLS_PER_DEVICE} className={styles.deviceHeader}>
                              {device === 'mobile' ? '📱 Mobile' : '🖥️ Desktop'}
                            </th>
                          ))
                        )}
                      </tr>
                      <tr>
                        {uniqueDates.map(date =>
                          DEVICES.map(device => {
                            const stats = computeGoodUrlStats(activeCompany.urls, date, device, dataMap);
                            return (
                              <th key={`${date}-${device}-stats`} colSpan={COLS_PER_DEVICE} className={styles.summaryHeader}>
                                <div className={styles.summaryBlock}>
                                  <span className={styles.summaryOrigin}>
                                    Good URL (Origin): {stats.originPass}/{stats.totalUrls}{' '}
                                    ({formatPct(stats.originPass, stats.totalUrls)})
                                  </span>
                                  <span className={styles.summaryDivider}>|</span>
                                  <span className={styles.summaryDirect}>
                                    Good URL (Traffic): {stats.directPass}/{stats.directTotal}{' '}
                                    ({formatPct(stats.directPass, stats.directTotal)})
                                  </span>
                                </div>
                              </th>
                            );
                          })
                        )}
                      </tr>
                      <tr>
                        {uniqueDates.map(date =>
                          DEVICES.map(device =>
                            METRIC_LABELS.map(metric => {
                              const colKey: SortKey =
                                metric === 'Status'
                                  ? `${date}-${device}-status`
                                  : `${date}-${device}-${metric.toLowerCase() as MetricKey}`;
                              return (
                                <th
                                  key={`${date}-${device}-${metric}`}
                                  className={`${styles.metricHeader} ${styles.sortableHeader}`}
                                  onClick={() => handleSort(colKey)}
                                >
                                  {metric}{sortIndicator(colKey)}
                                </th>
                              );
                            })
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {displayUrls.map((url, i) => (
                        <tr
                          key={url}
                          className={fetchingUrls.has(url) ? styles.rowFetching : ''}
                          onContextMenu={e => handleUrlContextMenu(e, url)}
                        >
                          <td className={styles.seqCell}>{i + 1}</td>
                          <td className={styles.urlCell} title={`${url}\nRight-click to fetch`}>
                            {fetchingUrls.has(url) && <span className={styles.fetchingDot} />}
                            {url}
                            {dataMap[url] && Object.values(dataMap[url]).some(d =>
                              d.mobile?.isOriginFallback || d.desktop?.isOriginFallback
                            ) && (
                              <span className={styles.originLabel}>Origin</span>
                            )}
                          </td>
                          {uniqueDates.map(date =>
                            DEVICES.map(device => {
                              const r = dataMap[url]?.[date]?.[device];
                              if (!r) {
                                return METRIC_LABELS.map((_, mi) => (
                                  <td key={`${date}-${device}-empty-${mi}`} className={styles.emptyCell}>—</td>
                                ));
                              }
                              const statusClass =
                                r.status === 'Pass' ? styles.statusPass
                                : r.status === 'Fail' ? styles.statusFail
                                : styles.statusUnknown;
                              return METRIC_LABELS.map(label => {
                                if (label === 'Status') {
                                  return (
                                    <td key={`${date}-${device}-status`} className={`${styles.metricCell} ${styles.statusCell}`}>
                                      <span className={`${styles.badge} ${statusClass}`}>{r.status}</span>
                                      {r.isOriginFallback && <span className={styles.originLabel}>Origin</span>}
                                    </td>
                                  );
                                }
                                const key = label.toLowerCase() as MetricKey;
                                const cls = getMetricClass(key, r[key], styles);
                                return (
                                  <td key={`${date}-${device}-${key}`} className={`${styles.metricCell} ${cls}`}>
                                    {fmt(r[key], key)}
                                  </td>
                                );
                              });
                            })
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          ref={menuRef}
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              triggerFetch([contextMenu.url], true);
              setContextMenu(null);
            }}
          >
            Fetch CWV for this URL
          </button>
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.url);
              setContextMenu(null);
            }}
          >
            Copy URL
          </button>
        </div>
      )}
    </div>
  );
}
