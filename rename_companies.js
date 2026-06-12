const mongoose = require('mongoose');
const { loadEnv } = require('./loadEnv');

loadEnv();
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI not set in .env');

const renames = [
  { from: 'company_url',     to: 'Axis Max Life' },
  { from: 'competitor_url_1', to: 'HDFC Life' },
  { from: 'competitor_url_2', to: 'ICICI Pru Life' },
  { from: 'competitor_url_3', to: 'PolicyBazaar' },
];

async function rename() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  for (const r of renames) {
    const result = await db.collection('companies').updateOne(
      { name: r.from },
      { $set: { name: r.to } }
    );
    console.log(`${r.from} -> ${r.to}: ${result.modifiedCount} doc updated`);
  }
  console.log('Done!');
  process.exit(0);
}

rename().catch(e => { console.error(e); process.exit(1); });
