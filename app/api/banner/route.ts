import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { featureFlags } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const revalidate = 0; // Dynamic route, do not cache statically

export interface BannerConfig {
  enabled: boolean;
  message: string;
  type: 'info' | 'warning' | 'danger' | 'success';
  linkUrl?: string;
  linkText?: string;
  bannerId: string;
}

const DEFAULT_BANNER: BannerConfig = {
  enabled: false,
  message: '',
  type: 'info',
  linkUrl: '',
  linkText: '',
  bannerId: 'default',
};

export async function GET() {
  try {
    const [flagRecord] = await db.select().from(featureFlags).where(eq(featureFlags.key, 'banner.config'));
    if (!flagRecord || !flagRecord.value) {
      return NextResponse.json(DEFAULT_BANNER);
    }

    const config = typeof flagRecord.value === 'object'
      ? (flagRecord.value as unknown as BannerConfig)
      : JSON.parse(String(flagRecord.value));

    return NextResponse.json({
      enabled: Boolean(config.enabled),
      message: config.message || '',
      type: config.type || 'info',
      linkUrl: config.linkUrl || '',
      linkText: config.linkText || '',
      bannerId: config.bannerId || 'default',
    });
  } catch (err: any) {
    console.error('[Public Banner API Error]', err.message);
    return NextResponse.json(DEFAULT_BANNER);
  }
}
