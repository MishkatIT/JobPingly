import { db } from '@/lib/db/client';
import { lists, careerPages, listCareerPages, users } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export const ADMIN_MASTER_LIST_SLUG = 'all-monitored-career-urls-admin-master';
export const ADMIN_MASTER_LIST_NAME = 'All Monitored URLs (Master Admin List)';

/**
 * Finds or creates the Admin Private Master Watchlist ("All Monitored Career URLs")
 * and auto-syncs ALL monitored career page URLs across the platform into it.
 */
export async function ensureAdminMasterWatchlist(adminUserId: string) {
  try {
    // 1. Find existing master list owned by this admin or create one
    let [masterList] = await db.select()
      .from(lists)
      .where(
        and(
          eq(lists.userId, adminUserId),
          eq(lists.slug, ADMIN_MASTER_LIST_SLUG)
        )
      );

    if (!masterList) {
      [masterList] = await db.insert(lists).values({
        userId: adminUserId,
        name: ADMIN_MASTER_LIST_NAME,
        slug: ADMIN_MASTER_LIST_SLUG,
        description: 'Auto-updated private master list containing all monitored career URLs across the platform.|EXCLUDED:[]',
        visibility: 'private',
        isCanonical: false,
      }).onConflictDoNothing().returning();

      if (!masterList) {
        [masterList] = await db.select()
          .from(lists)
          .where(eq(lists.slug, ADMIN_MASTER_LIST_SLUG));
      }
    }

    if (!masterList) return null;

    // Parse explicitly excluded page IDs for this admin master list
    const desc = masterList.description || '';
    const excludedMatch = desc.match(/\|EXCLUDED:\[(.*?)\]/);
    const excludedSet = new Set<string>();
    if (excludedMatch && excludedMatch[1]) {
      excludedMatch[1].split(',').map(id => id.trim()).filter(Boolean).forEach(id => excludedSet.add(id));
    }

    // 2. Fetch all career page URLs in the platform
    const allPages = await db.select({ id: careerPages.id }).from(careerPages);
    if (allPages.length === 0) return masterList;

    // 3. Auto-sync missing career page links EXCEPT explicitly excluded ones
    for (const page of allPages) {
      if (excludedSet.has(page.id)) continue; // Skip explicitly removed items!

      await db.insert(listCareerPages).values({
        listId: masterList.id,
        careerPageId: page.id,
        isPaused: false,
      }).onConflictDoNothing().catch(() => null);
    }

    return masterList;
  } catch (err) {
    console.error('[Admin Master Watchlist Auto-Sync Error]', err);
    return null;
  }
}

/**
 * Registers an explicit career page removal for an admin master list
 * to prevent auto-sync from re-adding it.
 */
export async function excludePageFromAdminMasterList(listId: string, careerPageId: string) {
  try {
    const [list] = await db.select().from(lists).where(eq(lists.id, listId));
    if (!list || list.slug !== ADMIN_MASTER_LIST_SLUG) return;

    const desc = list.description || 'Auto-updated private master list.|EXCLUDED:[]';
    const excludedMatch = desc.match(/\|EXCLUDED:\[(.*?)\]/);
    const existingIds = excludedMatch && excludedMatch[1]
      ? excludedMatch[1].split(',').map(id => id.trim()).filter(Boolean)
      : [];

    if (!existingIds.includes(careerPageId)) {
      existingIds.push(careerPageId);
      const baseDesc = desc.split('|EXCLUDED:')[0].trim();
      const updatedDesc = `${baseDesc}|EXCLUDED:[${existingIds.join(',')}]`;

      await db.update(lists)
        .set({ description: updatedDesc })
        .where(eq(lists.id, listId));
    }
  } catch (err) {
    console.error('[Exclude Page Error]', err);
  }
}
