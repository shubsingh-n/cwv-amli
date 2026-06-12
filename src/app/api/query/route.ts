import { NextResponse } from 'next/server';
import { Company } from '@/models/Company';
import { CWVRecord } from '@/models/CWVRecord';
import dbConnect from '@/lib/mongoose';

export async function POST(request: Request) {
  try {
    await dbConnect();

    const body = await request.json();
    const { companies, startDate, endDate, device, source, status } = body;

    const query: any = {};

    // 1. Filter by company URLs
    if (companies && companies.length > 0) {
      const matchedCompanies = await Company.find({ name: { $in: companies } }).lean();
      const urls = matchedCompanies.flatMap(c => c.urls);
      query.url = { $in: urls };
    }

    // 2. Filter by date range
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    // 3. Filter by device
    if (device && device !== 'all') {
      query.device = device;
    }

    // 4. Filter by source (Origin vs Traffic)
    if (source && source !== 'all') {
      query.isOriginFallback = source === 'origin';
    }

    // 5. Filter by status
    if (status && status !== 'all') {
      // Map frontend 'pass', 'fail', 'unknown' to 'Pass', 'Fail', 'Unknown'
      const statusCapitalized = status.charAt(0).toUpperCase() + status.slice(1);
      query.status = statusCapitalized;
    }

    // Execute query
    const records = await CWVRecord.find(query).sort({ date: 1 }).lean();

    return NextResponse.json({
      success: true,
      records
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
