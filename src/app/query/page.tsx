"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './query.module.css';

interface Company {
  _id: string;
  name: string;
  urls: string[];
}

interface CWVRecord {
  url: string;
  date: string;
  device: string;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  status: string;
  isOriginFallback: boolean;
}

export default function QueryPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);

  // Form State
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [device, setDevice] = useState('all');
  const [source, setSource] = useState('all');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await fetch('/api/dashboard');
        const data = await res.json();
        if (data.success) {
          setCompanies(data.companies);
        }
      } catch (err) {
        console.error('Failed to load companies', err);
      }
      setLoading(false);
    };
    fetchCompanies();
  }, []);

  const toggleCompany = (name: string) => {
    const newSet = new Set(selectedCompanies);
    if (newSet.has(name)) newSet.delete(name);
    else newSet.add(name);
    setSelectedCompanies(newSet);
  };

  const handleQueryAndDownload = async () => {
    setQuerying(true);
    try {
      const payload = {
        companies: Array.from(selectedCompanies),
        startDate,
        endDate,
        device,
        source,
        status
      };

      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success && data.records.length > 0) {
        downloadCSV(data.records);
      } else {
        alert('No records found for the selected query.');
      }
    } catch (err) {
      console.error('Query failed', err);
      alert('An error occurred while querying.');
    }
    setQuerying(false);
  };

  const downloadCSV = (records: CWVRecord[]) => {
    const header = ['URL', 'Date', 'Device', 'FCP', 'LCP', 'CLS', 'INP', 'Status', 'Is Origin'];
    const rows = [header.join(',')];

    records.forEach(r => {
      const row = [
        `"${r.url}"`,
        `"${r.date}"`,
        `"${r.device}"`,
        r.fcp !== null ? r.fcp : '—',
        r.lcp !== null ? r.lcp : '—',
        r.cls !== null ? r.cls : '—',
        r.inp !== null ? r.inp : '—',
        `"${r.status}"`,
        r.isOriginFallback ? 'Yes' : 'No'
      ];
      rows.push(row.join(','));
    });

    const csvStr = rows.join('\n');
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'cwv_query_results.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className={styles.loading}>Loading Query Interface...</div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => router.push('/')}>
            ← Back
          </button>
          <h1 className={styles.title}>Data Query & Export</h1>
        </div>
      </header>

      <div className={styles.formCard}>
        <div className={styles.formGroup}>
          <h3>Companies</h3>
          <div className={styles.checkboxGrid}>
            {companies.map(c => (
              <label key={c._id} className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={selectedCompanies.has(c.name)}
                  onChange={() => toggleCompany(c.name)}
                />
                {c.name}
              </label>
            ))}
          </div>
          <p className={styles.hint}>Leave all unchecked to query all companies.</p>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <h3>Start Date</h3>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={styles.input} />
          </div>
          <div className={styles.formGroup}>
            <h3>End Date</h3>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={styles.input} />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <h3>Device</h3>
            <select value={device} onChange={e => setDevice(e.target.value)} className={styles.input}>
              <option value="all">All Devices</option>
              <option value="mobile">Mobile Only</option>
              <option value="desktop">Desktop Only</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <h3>Source</h3>
            <select value={source} onChange={e => setSource(e.target.value)} className={styles.input}>
              <option value="all">Origin & Traffic</option>
              <option value="origin">Origin Only</option>
              <option value="traffic">Traffic Only</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <h3>Status</h3>
            <select value={status} onChange={e => setStatus(e.target.value)} className={styles.input}>
              <option value="all">All Statuses</option>
              <option value="pass">Pass Only</option>
              <option value="fail">Fail Only</option>
              <option value="unknown">Unknown Only</option>
            </select>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleQueryAndDownload}
            disabled={querying}
          >
            {querying ? 'Querying...' : 'Query & Download CSV'}
          </button>
        </div>
      </div>
    </div>
  );
}
