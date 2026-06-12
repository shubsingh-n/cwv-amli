import React from 'react';
import styles from '../dashboard.module.css';

interface Company {
  _id: string;
  name: string;
  urls: string[];
}

type Device = 'mobile' | 'desktop';

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

type DataMap = Record<string, Record<string, Record<Device, CWVRecord>>>;

interface Props {
  company: Company;
  dates: string[];
  dataMap: DataMap;
}

export default function CompanyTable({ company, dates, dataMap }: Props) {
  // Placeholder rendering – you can replace with full table logic later
  return (
    <div className={styles.tablePlaceholder}>
      <p>Company Table for {company.name} (placeholder)</p>
    </div>
  );
}
