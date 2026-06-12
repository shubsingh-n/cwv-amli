import React from 'react';
import styles from '../dashboard.module.css';

interface Company {
  _id: string;
  name: string;
  urls: string[];
}

type Device = 'mobile' | 'desktop';

type MetricKey = 'fcp' | 'lcp' | 'cls' | 'inp';

interface CWVRecord {
  _id: string;
  url: string;
  date: string;
  device: Device;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  status: 'Pass' | 'Fail' | 'Unknown';
  isOriginFallback?: boolean;
}

type DataMap = Record<string, Record<string, Record<string, CWVRecord>>>;

interface Props {
  company: Company;
  dates: string[];
  dataMap: DataMap;
}

export default function CompanyChart({ company, dates, dataMap }: Props) {
  // Placeholder – replace with real chart implementation (e.g., using chart.js or recharts)
  return (
    <div className={styles.chartPlaceholder}>
      <p>Chart for {company.name} (placeholder)</p>
    </div>
  );
}
