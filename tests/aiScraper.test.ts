import { describe, it, expect, vi } from 'vitest';
import { WorkdayAdapter } from '../packages/scraper/src/adapters/workday';
import { ExtractedJobSchema, ExtractedPageSchema } from '../packages/scraper/src/aiExtractor';

describe('1. Workday ATS Adapter Detection', () => {
  it('should detect Workday career site URLs', () => {
    const isWd1 = WorkdayAdapter.detect('https://company.wd5.myworkdayjobs.com/en-US/Careers', '');
    expect(isWd1).toBe(true);

    const isWd2 = WorkdayAdapter.detect('https://nvidia.wd1.myworkdayjobs.com/NVIDIAExternalCareerSite', '');
    expect(isWd2).toBe(true);

    const isNonWd = WorkdayAdapter.detect('https://boards.greenhouse.io/acme', '<html></html>');
    expect(isNonWd).toBe(false);
  });
});

describe('2. AI Extractor Zod Schemas', () => {
  it('should validate and parse structured AI extracted job output', () => {
    const validJob = {
      jobTitle: 'Senior Staff AI Infrastructure Engineer',
      company: 'NVIDIA',
      location: 'Santa Clara, CA, USA',
      employmentType: 'Full-time',
      department: 'Infrastructure',
      applicationUrl: 'https://nvidia.wd1.myworkdayjobs.com/Careers/job/Santa-Clara/Senior-Engineer_R123',
    };

    const parsed = ExtractedJobSchema.parse(validJob);
    expect(parsed.jobTitle).toBe('Senior Staff AI Infrastructure Engineer');
    expect(parsed.location).toBe('Santa Clara, CA, USA');
  });

  it('should validate batch AI page result payload', () => {
    const validPage = {
      pageId: 'page_123',
      jobs: [
        {
          jobTitle: 'Frontend Engineer',
          location: 'Remote',
        },
      ],
    };

    const parsed = ExtractedPageSchema.parse(validPage);
    expect(parsed.jobs.length).toBe(1);
    expect(parsed.jobs[0].jobTitle).toBe('Frontend Engineer');
  });
});
