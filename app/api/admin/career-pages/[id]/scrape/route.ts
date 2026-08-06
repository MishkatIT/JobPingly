import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { runScraperPipeline } from '@/packages/scraper/src/pipeline';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const adminUser = await requireAdmin(req);
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  }

  const careerPageId = params.id;

  try {
    const res = await runScraperPipeline(careerPageId, { force: true });
    return NextResponse.json({
      success: true,
      result: res,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Scrape execution failed' }, { status: 500 });
  }
}
