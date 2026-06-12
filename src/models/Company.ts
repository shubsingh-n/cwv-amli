import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICompany extends Document {
  name: string;
  urls: string[];
}

const CompanySchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
  urls: [{ type: String }],
});

export const Company: Model<ICompany> = mongoose.models.Company || mongoose.model<ICompany>('Company', CompanySchema);
