import { NextResponse } from 'next/server';
import { Company } from '@/models/Company';
import { CWVRecord } from '@/models/CWVRecord';
import dbConnect from '@/lib/mongoose';

export async function GET() {
  try {
    await dbConnect();

    const companies = await Company.find({}).lean();
    
    // Calculate cutoff date: 28 days ago
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 28);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // Get records for the last 28 days
    const records = await CWVRecord.find({ date: { $gte: cutoffStr } }).sort({ date: 1 }).lean();

    return NextResponse.json({
      success: true,
      companies,
      records
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
