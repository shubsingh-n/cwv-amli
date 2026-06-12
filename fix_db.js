const mongoose = require('mongoose');
const { loadEnv } = require('./loadEnv');

loadEnv();
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI not set in .env');

const CompanySchema = new mongoose.Schema({
  name: { type: String, required: true },
  urls: [{ type: String }],
});

const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema, 'companies');

async function fix() {
  try {
    await mongoose.connect(MONGODB_URI);
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
  const companies = await Company.find();
  for (const c of companies) {
    const oldName = c.name;
    const newName = c.name.replace(/\uFEFF/g, '');
    
    const uniqueUrls = [...new Set(c.urls)];
    
    // Just update the document directly
    await Company.updateOne(
      { _id: c._id },
      { $set: { name: newName, urls: uniqueUrls } }
    );
    console.log(`Cleaned ${oldName} -> ${newName}, URLs: ${c.urls.length} -> ${uniqueUrls.length}`);
  }
  console.log('Fixed DB');
  process.exit(0);
}

fix();
