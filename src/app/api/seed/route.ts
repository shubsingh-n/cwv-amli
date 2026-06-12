import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import dbConnect from '@/lib/mongoose';
import { Company } from '@/models/Company';

export async function POST() {
  try {
    await dbConnect();

    const csvFilePath = path.join(process.cwd(), 'url', 'url.csv');
    
    if (!fs.existsSync(csvFilePath)) {
      return NextResponse.json({ error: 'url.csv not found in /url folder' }, { status: 404 });
    }

    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
    
    // Parse CSV with the first row as columns
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as Record<string, string>[];

    if (records.length === 0) {
      return NextResponse.json({ error: 'CSV is empty' }, { status: 400 });
    }

    // records will be an array of objects: { "MyCompany": "url1", "Competitor1": "url2", ... }
    const companyNames = Object.keys(records[0]);
    const companyUrls: Record<string, string[]> = {};

    companyNames.forEach(name => {
      companyUrls[name] = [];
    });

    records.forEach((row: Record<string, string>) => {
      companyNames.forEach(name => {
        const url = row[name];
        if (url && url.trim().length > 0) {
          companyUrls[name].push(url.trim());
        }
      });
    });

    // Clear existing companies or just update
    await Company.deleteMany({});

    for (const name of companyNames) {
      await Company.create({
        name,
        urls: companyUrls[name]
      });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Companies and URLs seeded successfully',
      data: companyUrls 
    });

  } catch (error: any) {
    console.error('Seed Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
