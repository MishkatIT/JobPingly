import { z } from 'zod';
import { callOllamaCloud } from '../../../lib/ai/ollamaClient';

// Zod validation schema for extracted job item
export const ExtractedJobSchema = z.object({
  jobTitle: z.string().min(1),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  employmentType: z.string().nullable().optional(),
  workplaceType: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  experience: z.string().nullable().optional(),
  salary: z.string().nullable().optional(),
  postedDate: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  jobId: z.string().nullable().optional(),
  applicationUrl: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const ExtractedPageSchema = z.object({
  pageId: z.string(),
  jobs: z.array(ExtractedJobSchema),
});

export const AiExtractionResponseSchema = z.object({
  pages: z.array(ExtractedPageSchema),
});

export type ExtractedJob = z.infer<typeof ExtractedJobSchema>;
export type ExtractedPageResult = z.infer<typeof ExtractedPageSchema>;

export interface ScrapedPageInput {
  pageId: string;
  sourceUrl: string;
  content: string;
  companyName?: string;
}

const SYSTEM_PROMPT = `You are a structured job vacancy extraction engine.

You will receive content scraped from one or more company career pages.

Your job is to identify currently available job vacancies explicitly present in the supplied content.

Rules:

1. Never invent a job.
2. Never invent missing information.
3. Extract only vacancies supported by the supplied page content.
4. Ignore navigation links, generic company information, talent-network invitations, newsletters, unrelated articles, and old/closed jobs when clearly identified as closed.
5. Keep each job associated with the correct pageId.
6. Preserve application URLs when available.
7. Resolve relative URLs against sourceUrl when possible.
8. If a field is unavailable, return null.
9. If there are no jobs on a page, return an empty jobs array for that page.
10. Return valid JSON only.
11. Do not return Markdown.
12. Do not return explanations before or after the JSON.
13. Do not wrap the response in \`\`\`json.
14. Do not guess dates, salaries, locations, job IDs, or employment types.
15. jobTitle must be the actual vacancy title, not headings such as "Careers", "Join Us", or "Open Positions".`;

/**
 * Extracts structured job vacancy data from a batch of cleaned career pages using Ollama Cloud (qwen3.5:cloud).
 */
export async function extractJobsWithAI(
  batchPages: ScrapedPageInput[]
): Promise<ExtractedPageResult[]> {
  if (!batchPages || batchPages.length === 0) {
    return [];
  }

  const promptData = {
    pages: batchPages.map((p) => ({
      pageId: p.pageId,
      sourceUrl: p.sourceUrl,
      content: p.content,
    })),
  };

  const userPrompt = JSON.stringify(promptData);

  try {
    const rawResponse = await callOllamaCloud(userPrompt, SYSTEM_PROMPT);

    // Sanitize any markdown markdown fence wrappers returned by LLM
    let cleanJsonStr = rawResponse.trim();
    if (cleanJsonStr.startsWith('```')) {
      cleanJsonStr = cleanJsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    let parsedJson = JSON.parse(cleanJsonStr);
    
    // Normalize response formats returned by different LLM models
    if (Array.isArray(parsedJson)) {
      parsedJson = { pages: parsedJson };
    } else if (parsedJson && typeof parsedJson === 'object' && !parsedJson.pages && Array.isArray(parsedJson.jobs)) {
      parsedJson = { pages: [{ pageId: batchPages[0]?.pageId || 'p1', jobs: parsedJson.jobs }] };
    }

    // Coerce nested salary/location objects to string if returned by LLM
    if (parsedJson?.pages && Array.isArray(parsedJson.pages)) {
      for (const pageItem of parsedJson.pages) {
        if (pageItem?.jobs && Array.isArray(pageItem.jobs)) {
          for (const j of pageItem.jobs) {
            if (j && typeof j.salary === 'object' && j.salary !== null) {
              const s = j.salary;
              j.salary = s.amount || s.value || s.text || JSON.stringify(s).replace(/[{}"\\]/g, '');
            }
            if (j && typeof j.location === 'object' && j.location !== null) {
              const l = j.location;
              j.location = l.name || l.address || l.text || JSON.stringify(l).replace(/[{}"\\]/g, '');
            }
          }
        }
      }
    }

    const validated = AiExtractionResponseSchema.parse(parsedJson);

    return validated.pages;
  } catch (err: any) {
    console.error('[AI Job Extractor] Extraction or validation error:', err.message);
    throw new Error(`AI Job Extraction failed validation: ${err.message}`);
  }
}
