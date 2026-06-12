const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const mongoose = require('mongoose');

const CompanySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  urls: [{ type: String }],
});

const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema);

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const csvFilePath = path.join(__dirname, 'url', 'url.csv');
    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
    
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const companyNames = Object.keys(records[0]);
    const companyUrls = {};

    companyNames.forEach(name => {
      if (name.trim()) companyUrls[name] = [];
    });

    records.forEach(row => {
      companyNames.forEach(name => {
        if (!name.trim()) return;
        const url = row[name];
        if (url && url.trim().length > 0) {
          companyUrls[name].push(url.trim());
        }
      });
    });

    await Company.deleteMany({});
    
    for (const name of Object.keys(companyUrls)) {
      await Company.create({
        name,
        urls: companyUrls[name]
      });
      console.log(`Created company: ${name} with ${companyUrls[name].length} URLs`);
    }

    console.log('Seed successful');
    process.exit(0);
  } catch (err) {
    console.error('Seed Error:', err);
    process.exit(1);
  }
}

seed();
