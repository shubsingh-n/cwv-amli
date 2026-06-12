require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ MongoDB connection succeeded');
    await mongoose.disconnect();
  } catch (e) {
    console.error('❌ Connection error:', e.message);
  }
})();
