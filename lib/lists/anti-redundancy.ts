import { db } from '@/lib/db/client';
import { lists, listCareerPages } from '@/lib/db/schema';
import { eq, ne, and } from 'drizzle-orm';

export interface SimilarityResult {
  isDuplicate: boolean;
  similarityScore: number;
  matchingList?: {
    id: string;
    name: string;
    slug: string;
  };
}

/**
 * Calculates Jaccard Similarity between target list's company IDs and existing public lists.
 * If similarity >= threshold (default 85%), returns the matching canonical list.
 */
export async function checkListRedundancy(
  targetCareerPageIds: string[],
  excludeListId?: string,
  threshold = 0.85
): Promise<SimilarityResult> {
  if (!targetCareerPageIds || targetCareerPageIds.length === 0) {
    return { isDuplicate: false, similarityScore: 0 };
  }

  const targetSet = new Set(targetCareerPageIds);

  // Fetch all public lists except the excluded one
  const publicLists = await db
    .select({
      id: lists.id,
      name: lists.name,
      slug: lists.slug,
    })
    .from(lists)
    .where(
      excludeListId
        ? and(eq(lists.visibility, 'public'), ne(lists.id, excludeListId))
        : eq(lists.visibility, 'public')
    );

  let highestScore = 0;
  let matchingList: { id: string; name: string; slug: string } | undefined;

  for (const pubList of publicLists) {
    const listPages = await db
      .select({ careerPageId: listCareerPages.careerPageId })
      .from(listCareerPages)
      .where(eq(listCareerPages.listId, pubList.id));

    if (listPages.length === 0) continue;

    const otherSet = new Set(listPages.map((p) => p.careerPageId));

    // Calculate intersection
    let intersection = 0;
    for (const pageId of targetSet) {
      if (otherSet.has(pageId)) {
        intersection++;
      }
    }

    // Union
    const union = targetSet.size + otherSet.size - intersection;
    const jaccard = union > 0 ? intersection / union : 0;

    if (jaccard > highestScore) {
      highestScore = jaccard;
      matchingList = pubList;
    }
  }

  const isDuplicate = highestScore >= threshold;

  return {
    isDuplicate,
    similarityScore: Math.round(highestScore * 100) / 100,
    matchingList: isDuplicate ? matchingList : undefined,
  };
}

/**
 * Computes dynamic rank/reputation score for sorting public lists on /discover
 */
export function computeListQualityScore(list: {
  followerCount: number;
  contributionCount: number;
  companyCount: number;
  isCanonical: boolean;
}): number {
  const followerWeight = list.followerCount * 3;
  const contribWeight = list.contributionCount * 2;
  const companyWeight = Math.min(list.companyCount, 50);
  const nonCanonicalPenalty = list.isCanonical ? 0 : 50;

  return followerWeight + contribWeight + companyWeight - nonCanonicalPenalty;
}
