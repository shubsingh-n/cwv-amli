const fs = require('fs');
const path = require('path');

for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const CRUX_API_KEY =
  process.env.CRUX_API_KEY?.trim() ||
  process.env.PAGESPEED_API_KEY?.trim();

const CRUX_API_URL = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

async function queryCrux(body) {
  const start = Date.now();
  const res = await fetch(`${CRUX_API_URL}?key=${CRUX_API_KEY}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      metrics: [
        'largest_contentful_paint',
        'first_contentful_paint',
        'cumulative_layout_shift',
        'interaction_to_next_paint',
      ],
    }),
  });
  const data = await res.json();
  console.log(`\n=== ${JSON.stringify(body)} (${((Date.now() - start) / 1000).toFixed(2)}s) ===\n`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function inspect() {
  const url = 'https://www.axismaxlife.com/term-insurance-plans';

  await queryCrux({ url, formFactor: 'PHONE' });

  const origin = new URL(url).origin;
  await queryCrux({ origin, formFactor: 'PHONE' });
}

inspect().catch(console.error);
