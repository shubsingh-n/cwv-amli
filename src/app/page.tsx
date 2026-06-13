"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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

  const [records, setRecords] = useState<CWVRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('');
  const [fetchStatus, setFetchStatus] = useState<string>('');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'mobile' | 'desktop'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; url: string } | null>(null);
  const [fetchingUrls, setFetchingUrls] = useState<Set<string>>(new Set());
  const router = useRouter();

    const [companies, setCompanies] = useState<Company[]>([]);

  // Ref for the context menu DOM element
  const menuRef = useRef<HTMLDivElement>(null);

  // Derived data structures
  const activeCompany = useMemo(() => companies.find(c => c.name === activeTab), [companies, activeTab]);

  const dataMap = useMemo(() => {
    const map: Record<string, Record<string, Record<string, CWVRecord>>> = {};
    records.forEach(r => {
      if (!map[r.url]) map[r.url] = {};
      if (!map[r.url][r.date]) map[r.url][r.date] = {};
      map[r.url][r.date][r.device] = r;
    });
    return map;
  }, [records]);

  const uniqueDates = useMemo(() => {
    const dates = new Set(records.map(r => r.date));
    return Array.from(dates).sort().reverse();
  }, [records]);

  const latestDate = uniqueDates[0] ?? '';

  // Compute missing URLs for the latest date
  const computeMissingUrls = useCallback(() => {
    if (!latestDate) return [];
    return activeCompany?.urls.filter(url => {
      const mobile = dataMap[url]?.[latestDate]?.mobile;
      const desktop = dataMap[url]?.[latestDate]?.desktop;
      return !(mobile && desktop);
    }) ?? [];
  }, [activeCompany, latestDate, dataMap]);

  const missingUrls = useMemo(() => computeMissingUrls(), [computeMissingUrls]);

  const handleFetchMissing = async () => {
    if (!missingUrls.length) {
      setFetchStatus('No missing URLs');
      return;
    }
    await triggerFetch(missingUrls, false);
  };

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

  // Fetch new data for the current date (force re-fetch)
  const handleFetchNewData = () => triggerFetch(undefined, true);


  const handleUrlContextMenu = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, url });
  };

  const displayShortUrl = (u: string) => {
    try {
      const parsed = new URL(u);
      // remove protocol and host, keep pathname + search + hash
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || u;
    } catch {
      return u;
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

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
    // Start with all URLs of the active company
    let urls = [...activeCompany.urls];

    if (latestDate) {
      // Status filter
      if (statusFilter !== 'all') {
        urls = urls.filter(url => {
          const mobileStatus = dataMap[url]?.[latestDate]?.mobile?.status;
          const desktopStatus = dataMap[url]?.[latestDate]?.desktop?.status;
          
          const mobileMatch = mobileStatus && (statusFilter === 'pass' ? mobileStatus === 'Pass' : mobileStatus !== 'Pass');
          const desktopMatch = desktopStatus && (statusFilter === 'pass' ? desktopStatus === 'Pass' : desktopStatus !== 'Pass');
          
          if (deviceFilter === 'mobile') return mobileMatch;
          if (deviceFilter === 'desktop') return desktopMatch;
          return mobileMatch || desktopMatch;
        });
      }
      // Source filter
      if (sourceFilter !== 'all') {
        urls = urls.filter(url => {
          const mobileR = dataMap[url]?.[latestDate]?.mobile;
          const desktopR = dataMap[url]?.[latestDate]?.desktop;
          
          const mobileMatch = mobileR && (sourceFilter === 'origin' ? mobileR.isOriginFallback : !mobileR.isOriginFallback);
          const desktopMatch = desktopR && (sourceFilter === 'origin' ? desktopR.isOriginFallback : !desktopR.isOriginFallback);
          
          if (deviceFilter === 'mobile') return mobileMatch;
          if (deviceFilter === 'desktop') return desktopMatch;
          return mobileMatch || desktopMatch;
        });
      }
    }

    // Sorting
    if (sortKey) {
      urls.sort((a, b) => {
        const av = getSortValue(a, sortKey);
        const bv = getSortValue(b, sortKey);
        const cmp = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : (av as number) - (bv as number);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return urls;
  }, [activeCompany, statusFilter, sourceFilter, deviceFilter, latestDate, dataMap, sortKey, sortDir, getSortValue]);

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

  const exportCSV = () => {
    const rows: string[] = [];
    const header = ['URL'];
    uniqueDates.forEach(date => {
      DEVICES.forEach(device => {
        const dStr = device === 'mobile' ? 'Mobile' : 'Desktop';
        METRIC_LABELS.forEach(label => {
          header.push(`${date} ${dStr} ${label}`);
        });
      });
    });
    rows.push(header.join(','));

    displayUrls.forEach(url => {
      const row = [`"${url}"`];
      uniqueDates.forEach(date => {
        DEVICES.forEach(device => {
          const r = dataMap[url]?.[date]?.[device];
          if (!r) {
            METRIC_LABELS.forEach(() => row.push('"—"'));
          } else {
            METRIC_LABELS.forEach(label => {
              if (label === 'Status') {
                const statusStr = r.status + (r.isOriginFallback ? ' (Origin)' : '');
                row.push(`"${statusStr}"`);
              } else {
                const key = label.toLowerCase() as MetricKey;
                row.push(`"${fmt(r[key], key)}"`);
              }
            });
          }
        });
      });
      rows.push(row.join(','));
    });

    const csvStr = rows.join('\n');
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.setAttribute('download', 'cwv_root_tracker.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>CWV Tracker</h1>
        
        <button className={styles.mobileMenuToggle} onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} aria-label="Toggle menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>

        {isMobileMenuOpen && <div className={styles.mobileBackdrop} onClick={() => setIsMobileMenuOpen(false)} />}
        
        <div className={`${styles.actions} ${isMobileMenuOpen ? styles.actionsOpen : ''}`}>
          {fetchStatus && <span className={styles.fetchStatus}>{fetchStatus}</span>}

          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => { exportCSV(); setIsMobileMenuOpen(false); }} title="Export current view to CSV">
            Export CSV
          </button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => { handleFetchMissing(); setIsMobileMenuOpen(false); }} title="Fetch only URLs missing CWV data for today">
            Fetch Missing
          </button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => { fetchData(); setIsMobileMenuOpen(false); }}>
            Refresh
          </button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => { handleFetchNewData(); setIsMobileMenuOpen(false); }} title="Fetch new data for today (force)">
            Fetch New Data
          </button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => router.push('/dashboard')}>
            Go to Dashboard
          </button>
          <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => router.push('/query')}>
            Query Data
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
                <div className={styles.toolbarContainer}>
                  <div className={styles.mobileToolbarControls}>
                    <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setIsMobileFiltersOpen(true)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                      Filters
                    </button>
                  </div>

                  {isMobileFiltersOpen && <div className={styles.mobileBackdrop} onClick={() => setIsMobileFiltersOpen(false)} />}
                  
                  <div className={`${styles.toolbar} ${isMobileFiltersOpen ? styles.toolbarOpen : ''}`}>
                    <div className={styles.mobileSheetHeader}>
                      <h3>Filters</h3>
                      <button className={styles.closeSheetBtn} onClick={() => setIsMobileFiltersOpen(false)}>×</button>
                    </div>

                    <span className={styles.toolbarLabel}>Device:</span>
                    {(['all', 'mobile', 'desktop'] as const).map(d => (
                    <button
                      key={d}
                      className={`${styles.filterBtn} ${deviceFilter === d ? styles.filterBtnActive : ''}`}
                      onClick={() => {setDeviceFilter(d); setIsMobileFiltersOpen(false);}}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {d}
                    </button>
                  ))}
                  <span className={styles.toolbarDivider}>|</span>
                  <span className={styles.toolbarLabel}>Status:</span>
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
                  <span className={styles.toolbarLabel}>Source:</span>
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
                  
                  {isMobileFiltersOpen && (
                    <button className={`${styles.btn} ${styles.btnPrimary} ${styles.mobileApplyBtn}`} onClick={() => setIsMobileFiltersOpen(false)}>
                      Apply Filters
                    </button>
                  )}
                </div>
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
                            {displayShortUrl(url)}
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
              // Open the actual URL in a new tab/window
              window.open(contextMenu.url, '_blank', 'noopener');
              setContextMenu(null);
            }}
          >
            Open URL
          </button>
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
