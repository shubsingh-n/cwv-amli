"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import styles from './dashboard.module.css';

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
  isOriginFallback?: boolean;
}

type Device = 'mobile' | 'desktop';
type DataMap = Record<string, Record<string, Record<Device, CWVRecord>>>;

function buildDataMap(records: CWVRecord[]): DataMap {
  const map: DataMap = {};
  records.forEach(r => {
    if (!map[r.url]) map[r.url] = {};
    if (!map[r.url][r.date]) map[r.url][r.date] = {} as Record<Device, CWVRecord>;
    map[r.url][r.date][r.device] = r;
  });
  return map;
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
  dataMap: DataMap
): GoodUrlStats {
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

function formatStat(pass: number, total: number): string {
  if (total === 0) return '—';
  const pct = Math.round((pass / total) * 100);
  return `${pass}/${total} (${pct}%)`;
}

export default function Dashboard() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [records, setRecords] = useState<CWVRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      if (data.success) {
        setCompanies(data.companies);
        setRecords(data.records);
      }
    } catch (e) {
      console.error('Dashboard fetch error', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const dataMap = useMemo(() => buildDataMap(records), [records]);

  const uniqueDates = useMemo(() => {
    const dates = new Set(records.map(r => r.date));
    // newest → oldest (left to right)
    return Array.from(dates).sort().reverse();
  }, [records]);

const recentFailedInfo = useMemo(() => {
  if (uniqueDates.length < 1) return [];
  // Axis Max Life company URLs
  const axisCompany = companies.find(c => c.name.toLowerCase().includes('axis max life'));
  const axisUrls = axisCompany ? axisCompany.urls : [];

  return Object.keys(dataMap).reduce((acc, url) => {
    if (!axisUrls.includes(url)) return acc;
    // Determine failing devices on latest date
    const latestDate = uniqueDates[0];
    const latestDevices = dataMap[url]?.[latestDate] ?? {};
    const failingDevices = Object.entries(latestDevices)
      .filter(([, r]) => !(r?.status === 'Pass'))
      .map(([device]) => device as Device);
    // If any device passes today, skip this URL
    const anyPassToday = Object.values(latestDevices).some(r => r?.status === 'Pass');
    if (anyPassToday) return acc;

    // Find transition date: first date (newer) where fail follows a pass
    let transitionDate = '';
    for (let i = 0; i < uniqueDates.length - 1; i++) {
      const date = uniqueDates[i]; // newer date
      const olderDate = uniqueDates[i + 1]; // older date
      const dev = dataMap[url]?.[date] ?? {};
      const olderDev = dataMap[url]?.[olderDate] ?? {};
      const hasPass = Object.values(dev).some(r => r?.status === 'Pass');
      const olderHasPass = Object.values(olderDev).some(r => r?.status === 'Pass');
      // We need a fail on newer date (no pass) and a pass on older date
      if (!hasPass && olderHasPass) {
        transitionDate = date;
        break;
      }
    }


    if (transitionDate && failingDevices.length > 0) {
      acc.push({ url, devices: failingDevices, date: transitionDate });
    }
    return acc;
  }, [] as { url: string; devices: Device[]; date: string }[]);
}, [uniqueDates, dataMap, companies]);

  const DEVICES: Device[] = ['mobile', 'desktop'];

  const exportCSV = () => {
    const rows: string[] = [];
    
    // Build Header
    const header = ['Company'];
    uniqueDates.forEach(date => {
      DEVICES.forEach(device => {
        const dStr = device === 'mobile' ? 'Mobile' : 'Desktop';
        header.push(`${date} ${dStr} Origin`);
        header.push(`${date} ${dStr} Traffic`);
      });
    });
    rows.push(header.join(','));

    // Build Data Rows
    companies.forEach(company => {
      const row = [`"${company.name}"`];
      uniqueDates.forEach(date => {
        DEVICES.forEach(device => {
          const stats = computeGoodUrlStats(company.urls, date, device, dataMap);
          row.push(`"${formatStat(stats.originPass, stats.totalUrls)}"`);
          row.push(`"${formatStat(stats.directPass, stats.directTotal)}"`);
        });
      });
      rows.push(row.join(','));
    });

    const csvStr = rows.join('\n');
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'cwv_dashboard.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            className={styles.backBtn}
            onClick={() => router.push('/')}
            title="Back to Home"
          >
            ← Back
          </button>
          <h1 className={styles.title}>CWV Dashboard</h1>
        </div>
        <div className={styles.actions}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={exportCSV}>
            Export CSV
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={fetchData}>
            Refresh
          </button>
        </div>
      </header>
      <>
          {recentFailedInfo.length > 0 && (
            <div className={styles.recentFailedSection}>
              <h2 className={styles.sectionTitle}>Recently Failed URLs</h2>
              <ul className={styles.failedList}>
                {recentFailedInfo.map(item => (
                  <li key={item.url} className={styles.failedItem}>
                    {item.url} ({item.devices.join(', ')}) – {item.date}
                  </li>
                ))}
              </ul>
            </div>
          )}

        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loader} />
            <span>Loading Dashboard…</span>
          </div>
        ) : companies.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No Data Found</h2>
            <p>Ensure MongoDB is connected and URLs are seeded.</p>
          </div>
        ) : (
          <div className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th rowSpan={3} className={styles.urlHeader}>URL</th>
                    {uniqueDates.map(date => (
                      <th key={date} colSpan={4} className={styles.dateHeader}>
                        {date}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {uniqueDates.map(date =>
                      DEVICES.map(device => (
                        <th key={`${date}-${device}`} colSpan={2} className={styles.deviceHeader}>
                          {device === 'mobile' ? 'Mobile' : 'Desktop'}
                        </th>
                      ))
                    )}
                  </tr>
                  <tr>
                    {uniqueDates.map(date =>
                      DEVICES.map(device => (
                        <React.Fragment key={`${date}-${device}`}>
                          <th className={styles.subHeader}>Origin</th>
                          <th className={styles.subHeader}>Traffic</th>
                        </React.Fragment>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {companies.map(company => (
                    <tr key={company._id}>
                      <td className={styles.companyCell}>{company.name}</td>
                      {uniqueDates.map(date =>
                        DEVICES.map(device => {
                          const stats = computeGoodUrlStats(company.urls, date, device, dataMap);
                          return (
                            <React.Fragment key={`${date}-${device}`}>
                              <td className={styles.statCell}>{formatStat(stats.originPass, stats.totalUrls)}</td>
                              <td className={styles.statCell}>{formatStat(stats.directPass, stats.directTotal)}</td>
                            </React.Fragment>
                          );
                        })
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    </div>
  );
}
