import { db } from '../lib/db/client';
import { users, lists, listCollaborators, listCareerPages, jobs, listSubscriptions, emailApprovals, careerPages } from '../lib/db/schema';
import { eq, inArray, and, count, countDistinct } from 'drizzle-orm';

async function measureUser(userId: string) {
  console.log(`--- MEASURING PERFORMANCE FOR USER: ${userId} ---`);

  // 1. User lookup
  const tUserStart = performance.now();
  const [dbUser] = await db.select().from(users).where(eq(users.id, userId));
  const tUserEnd = performance.now();
  console.log(`User lookup: ${(tUserEnd - tUserStart).toFixed(2)}ms`);

  // 2. /api/lists BEFORE OPTIMIZATION
  const tListsStart = performance.now();
  
  const [rawUserLists, collabRecords] = await Promise.all([
    db.select().from(lists).where(eq(lists.userId, userId)),
    db
      .select({ listId: listCollaborators.listId, role: listCollaborators.role })
      .from(listCollaborators)
      .where(and(eq(listCollaborators.userId, userId), eq(listCollaborators.status, 'accepted'))),
  ]);

  const collabListIds = collabRecords.map(c => c.listId);
  const collabLists = collabListIds.length > 0 ? await db.select().from(lists).where(inArray(lists.id, collabListIds)) : [];

  const combinedLists = [...rawUserLists, ...collabLists];
  const paginated = combinedLists.slice(0, 9);
  const paginatedListIds = paginated.map(l => l.id);

  const allPaginatedPages = paginatedListIds.length > 0
    ? await db.select().from(listCareerPages).where(inArray(listCareerPages.listId, paginatedListIds))
    : [];

  const uniquePaginatedCareerPageIds = Array.from(new Set(allPaginatedPages.map(p => p.careerPageId)));
  
  // In-memory jobs fetch for paginated lists
  const tPaginatedJobsStart = performance.now();
  const activePaginatedJobs = uniquePaginatedCareerPageIds.length > 0
    ? await db.select({ careerPageId: jobs.careerPageId }).from(jobs).where(and(inArray(jobs.careerPageId, uniquePaginatedCareerPageIds), eq(jobs.status, 'active')))
    : [];
  const tPaginatedJobsEnd = performance.now();

  // In-memory stats query across ALL user lists
  const tStatsPagesStart = performance.now();
  const allUserListIds = combinedLists.map(l => l.id);
  const allUserListPages = allUserListIds.length > 0
    ? await db.select({ careerPageId: listCareerPages.careerPageId }).from(listCareerPages).where(inArray(listCareerPages.listId, allUserListIds))
    : [];
  const tStatsPagesEnd = performance.now();

  const uniquePageIds = Array.from(new Set(allUserListPages.map(p => p.careerPageId)));

  const tStatsJobsStart = performance.now();
  const activeUserJobs = uniquePageIds.length > 0
    ? await db.select({ id: jobs.id }).from(jobs).where(and(inArray(jobs.careerPageId, uniquePageIds), eq(jobs.status, 'active')))
    : [];
  const tStatsJobsEnd = performance.now();

  const tListsEnd = performance.now();

  console.log(`\n[/api/lists BEFORE OPTIMIZATION]`);
  console.log(`Total: ${(tListsEnd - tListsStart).toFixed(2)}ms`);
  console.log(`  - Combined User Lists: ${combinedLists.length}`);
  console.log(`  - Paginated List Career Pages: ${allPaginatedPages.length}`);
  console.log(`  - Paginated Active Jobs fetched into JS memory: ${activePaginatedJobs.length} rows in ${(tPaginatedJobsEnd - tPaginatedJobsStart).toFixed(2)}ms`);
  console.log(`  - Stats Career Pages query: ${allUserListPages.length} rows in ${(tStatsPagesEnd - tStatsPagesStart).toFixed(2)}ms`);
  console.log(`  - Stats Active Jobs query (IN-MEMORY FETCH): ${activeUserJobs.length} rows in ${(tStatsJobsEnd - tStatsJobsStart).toFixed(2)}ms`);

  // --- /api/lists AFTER OPTIMIZATION ---
  const tOptStart = performance.now();

  // 1. Paginated job count query using SQL GROUP BY count()
  const tOptPaginatedJobsStart = performance.now();
  let jobCountsGrouped: { careerPageId: string; count: number }[] = [];
  if (uniquePaginatedCareerPageIds.length > 0) {
    const res = await db
      .select({ careerPageId: jobs.careerPageId, count: count() })
      .from(jobs)
      .where(and(inArray(jobs.careerPageId, uniquePaginatedCareerPageIds), eq(jobs.status, 'active')))
      .groupBy(jobs.careerPageId);
    jobCountsGrouped = res.map(r => ({ careerPageId: r.careerPageId, count: Number(r.count) }));
  }
  const tOptPaginatedJobsEnd = performance.now();

  // 2. Stats query using SQL aggregate COUNT DISTINCT and COUNT
  const tOptStatsStart = performance.now();
  let optTotalUniqueCompanies = 0;
  let optTotalActiveJobs = 0;

  if (allUserListIds.length > 0) {
    const [compRes] = await db
      .select({ uniqueCompanies: countDistinct(listCareerPages.careerPageId) })
      .from(listCareerPages)
      .where(inArray(listCareerPages.listId, allUserListIds));
    optTotalUniqueCompanies = Number(compRes?.uniqueCompanies || 0);

    if (uniquePageIds.length > 0) {
      const [jobsRes] = await db
        .select({ totalJobs: count() })
        .from(jobs)
        .where(and(inArray(jobs.careerPageId, uniquePageIds), eq(jobs.status, 'active')));
      optTotalActiveJobs = Number(jobsRes?.totalJobs || 0);
    }
  }
  const tOptStatsEnd = performance.now();
  const tOptEnd = performance.now();

  // 3. /api/public/users/[id] OPTIMIZED
  const tPublicUserStart = performance.now();
  const [foundPublicUser] = await db.select({
    id: users.id,
    name: users.name,
    avatarUrl: users.avatarUrl,
    socials: users.socials,
    createdAt: users.createdAt,
  })
  .from(users)
  .where(eq(users.id, userId));

  const userPublicLists = await db.select({
    id: lists.id,
    name: lists.name,
    slug: lists.slug,
    description: lists.description,
    createdAt: lists.createdAt,
    updatedAt: lists.updatedAt,
  })
  .from(lists)
  .where(and(eq(lists.userId, userId), eq(lists.visibility, 'public')));

  const uListIds = userPublicLists.map(l => l.id);
  const uAllPages = uListIds.length > 0
    ? await db.select({ listId: listCareerPages.listId, careerPageId: listCareerPages.careerPageId })
        .from(listCareerPages)
        .where(inArray(listCareerPages.listId, uListIds))
    : [];

  const uUniquePages = Array.from(new Set(uAllPages.map(p => p.careerPageId)));
  let uJobGrouped: { careerPageId: string; jobCount: number }[] = [];
  if (uUniquePages.length > 0) {
    const res = await db
      .select({ careerPageId: jobs.careerPageId, jobCount: count() })
      .from(jobs)
      .where(and(inArray(jobs.careerPageId, uUniquePages), eq(jobs.status, 'active')))
      .groupBy(jobs.careerPageId);
    uJobGrouped = res.map(r => ({ careerPageId: r.careerPageId, jobCount: Number(r.jobCount) }));
  }
  const tPublicUserEnd = performance.now();

  console.log(`\n[/api/public/users/${userId} OPTIMIZED]`);
  console.log(`Total Optimized API Query Time: ${(tPublicUserEnd - tPublicUserStart).toFixed(2)}ms`);

  process.exit(0);
}

measureUser('399034fd-997a-44df-aff0-7c27d35a2822').catch(console.error);
