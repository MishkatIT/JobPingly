export function normalizeKeyword(input: string): string {
  return input
    .toLowerCase()
    .replace(/[._\-\s]+/g, '') // remove dots, underscores, hyphens, and whitespace
    .trim();
}

export function matchKeywords(
  userKeywords: string[] | null,
  title: string,
  department: string = '',
  location: string = ''
): { isMatch: boolean; matchedKeywords: string[] } {
  if (!userKeywords || userKeywords.length === 0) {
    // If no keywords specified, all jobs match
    return { isMatch: true, matchedKeywords: ['*'] };
  }

  const searchableText = `${title} ${department} ${location}`;
  const normalizedSearch = normalizeKeyword(searchableText);
  const matchedKeywords: string[] = [];

  for (const kw of userKeywords) {
    if (!kw || kw.trim().length === 0) continue;
    const normKw = normalizeKeyword(kw);

    if (normalizedSearch.includes(normKw)) {
      matchedKeywords.push(kw.trim());
    }
  }

  return {
    isMatch: matchedKeywords.length > 0,
    matchedKeywords,
  };
}
