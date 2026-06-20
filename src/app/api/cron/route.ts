import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { runCWVFetch } from '@/lib/cwvService';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const urlObj = new URL(request.url);
    const secretQuery = urlObj.searchParams.get('secret');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      const authorized =
        authHeader === `Bearer ${cronSecret}` ||
        secretQuery === cronSecret;

      if (!authorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // Use after() to avoid blocking the HTTP response and run the fetch in the background
    after(async () => {
      try {
        console.log('[Cron] Starting daily CWV fetch...');
        const result = await runCWVFetch({ force: false });
        console.log(
          `[Cron] Daily CWV fetch finished. Fetched: ${result.fetched}, Skipped: ${result.skipped}, Failed: ${result.failed}`
        );
      } catch (err) {
        console.error('[Cron] Daily CWV fetch failed:', err);
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Daily CWV fetch scheduled successfully in the background.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
