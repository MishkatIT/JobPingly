import { z } from 'zod';
import { route } from '@/lib/api/route';
import { previewSource } from '@/lib/companies/service';

const body = z.object({ url: z.string().trim().min(1, 'Paste the address of the careers page.').max(2048) });

/**
 * Reads a careers page without saving anything, so the user can see which job
 * board was detected and what JobPingly will find before adding it.
 */
export const POST = route(
  {
    body,
    rateLimit: [
      { name: 'companies:preview', limit: 20, windowSeconds: 600, by: 'user' },
      { name: 'companies:preview:ip', limit: 40, windowSeconds: 600 },
    ],
  },
  async ({ body }) => previewSource(body.url),
);
