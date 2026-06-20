export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Avoid double-registration in dev mode/hot-reloading
    const globalAny: any = global;
    if (globalAny.dailyCronScheduled) {
      return;
    }
    globalAny.dailyCronScheduled = true;

    try {
      const cron = await import('node-cron');
      const { runCWVFetch } = await import('@/lib/cwvService');

      console.log('[Cron] Registering daily CWV fetch cron job (10:00 AM IST)...');

      // Schedule at 10:00 AM (0 10 * * *) with Asia/Kolkata timezone
      cron.schedule(
        '0 10 * * *',
        async () => {
          console.log('[Cron] Running scheduled daily CWV fetch...');
          try {
            const result = await runCWVFetch({ force: false });
            console.log(
              `[Cron] Scheduled fetch completed. Fetched: ${result.fetched}, Skipped: ${result.skipped}, Failed: ${result.failed}`
            );
          } catch (err) {
            console.error('[Cron] Scheduled daily CWV fetch failed:', err);
          }
        },
        {
          timezone: 'Asia/Kolkata',
        }
      );

      console.log('[Cron] Daily CWV fetch cron job registered successfully.');
    } catch (error) {
      console.error('[Cron] Failed to register daily cron job:', error);
    }
  }
}
