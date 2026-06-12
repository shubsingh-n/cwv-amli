import { NextResponse } from 'next/server';
import { Company } from '@/models/Company';
import { CWVRecord } from '@/models/CWVRecord';
import dbConnect from '@/lib/mongoose';

export async function GET() {
  try {
    await dbConnect();

    const companies = await Company.find({}).lean();
    
    // Get all records (or could filter by last 30 days)
    const records = await CWVRecord.find({}).sort({ date: 1 }).lean();

    return NextResponse.json({
      success: true,
      companies,
      records
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
