import { NextResponse } from 'next/server';
import { runCWVFetch } from '@/lib/cwvService';

export async function POST(request: Request) {
  try {
    let urls: string[] | undefined;
    let force = false;

    try {
      const body = await request.json();
      if (Array.isArray(body.urls)) {
        urls = body.urls.filter((u: unknown) => typeof u === 'string' && u.length > 0);
      }
      if (body.force === true) force = true;
    } catch {
      // empty body — fetch all, skip existing
    }

    runCWVFetch({ urls, force }).catch(err => {
      console.error('Background fetch failed:', err);
    });

    const scope = urls?.length === 1
      ? `URL: ${urls[0]}`
      : urls?.length
        ? `${urls.length} URLs`
        : 'all URLs';

    return NextResponse.json({
      success: true,
      message: force
        ? `CWV fetch started for ${scope} (re-fetching existing data).`
        : `CWV fetch started for ${scope} (skipping already-fetched entries for today).`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
