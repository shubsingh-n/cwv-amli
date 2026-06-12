require('dotenv').config({ path: require('path').join(__dirname, '.env') });

function loadEnv() {
  // dotenv loads env variables automatically; this function is kept for compatibility.
}

module.exports = { loadEnv };
