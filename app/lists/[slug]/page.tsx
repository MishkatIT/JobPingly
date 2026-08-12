'use client';

import { useParams } from 'next/navigation';
import WatchListDetailView from '@/components/WatchListDetailView';

export default function PublicListPageView() {
  const params = useParams();
  const slug = params.slug as string;

  return <WatchListDetailView slug={slug} isDashboard={false} />;
}
