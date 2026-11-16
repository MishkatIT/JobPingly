'use client';

import { FeedbackDialog } from '@/components/app/feedback-dialog';
import { Button } from '@/components/ui/button';
import { useApi } from '@/lib/client/use-api';

export function HelpContact() {
  const { data } = useApi<{ user: unknown }>('/api/me');
  return (
    <div className="not-prose">
      <FeedbackDialog signedIn={Boolean(data)} trigger={open => <Button onClick={open}>Send a message</Button>} />
    </div>
  );
}
