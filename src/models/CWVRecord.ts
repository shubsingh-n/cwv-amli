import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICWVRecord extends Document {
  url: string;
  date: string; // ISO format string 'YYYY-MM-DD'
  device: 'mobile' | 'desktop';
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  status: 'Pass' | 'Fail' | 'Unknown';
  isOriginFallback: boolean;
  originStatus?: 'Pass' | 'Fail' | 'Unknown';
}

const CWVRecordSchema: Schema = new Schema({
  url: { type: String, required: true },
  date: { type: String, required: true },
  device: { type: String, enum: ['mobile', 'desktop'], required: true },
  fcp: { type: Number, default: null },
  lcp: { type: Number, default: null },
  cls: { type: Number, default: null },
  inp: { type: Number, default: null },
  status: { type: String, enum: ['Pass', 'Fail', 'Unknown'], default: 'Unknown' },
  isOriginFallback: { type: Boolean, default: false },
  originStatus: { type: String, enum: ['Pass', 'Fail', 'Unknown'], default: 'Unknown' },
});

// Compound index to ensure uniqueness for a given URL, date, and device
CWVRecordSchema.index({ url: 1, date: 1, device: 1 }, { unique: true });

export const CWVRecord: Model<ICWVRecord> = mongoose.models.CWV || mongoose.model<ICWVRecord>('CWV', CWVRecordSchema, 'CWV');
