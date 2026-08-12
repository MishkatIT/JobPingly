'use client';

import { useParams } from 'next/navigation';
import WatchListDetailView from '@/components/WatchListDetailView';

export default function DashboardListPage() {
  const params = useParams();
  const listId = params.listId as string;

  return <WatchListDetailView listId={listId} isDashboard={true} />;
}
