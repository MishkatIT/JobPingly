import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/lib/db/client';
import { emailApprovals, jobs, notificationQueue, users } from '@/lib/db/schema';
import { unsubscribeLinks } from '@/lib/email/unsubscribe';
import { processNotificationQueue } from '@/lib/notifications/processor';
import { hideJobs } from '@/lib/admin/jobs';
import * as unsubscribe from '@/app/api/unsubscribe/route';
import * as jobsRoute from '@/app/api/jobs/route';
import * as trackerRoute from '@/app/api/tracker/route';
import * as jobRoute from '@/app/api/jobs/[id]/route';
import { call, createListWithCompany, createSource, createUser, lastEmailTo, resetData } from '../helpers/integration';

async function scenario(options: { approved?: boolean; title?: string } = {}) {
  await resetData();
  const user = await createUser();
  await db.update(users).set({ notificationPreference: 'realtime' }).where(eq(users.id, user.id));
  if (options.approved !== false) await db.insert(emailApprovals).values({ email: user.email, userId: user.id, status: 'approved' });
  const source = await createSource('https://boards.greenhouse.io/notify-co', { companyName: 'Notify Co' });
  const list = await createListWithCompany(user.id, source.id);
  const [job] = await db
    .insert(jobs)
    .values({ careerPageId: source.id, fingerprint: 'ext:n1', title: options.title ?? 'Site Reliability Engineer', url: 'https://boards.greenhouse.io/notify-co/jobs/1', status: 'active' })
    .returning();
  await db.insert(notificationQueue).values({ userId: user.id, jobId: job.id, listId: list.id, eventType: 'new' });
  return { user, source, list, job };
}

const pending = async (userId: string) => (await db.select().from(notificationQueue).where(eq(notificationQueue.userId, userId))).filter(row => !row.sentAt);

before(resetData);
after(() => closeDb());

describe('Alert delivery', () => {
  test('an approved, realtime recipient gets one digest and the queue is settled', async () => {
    const { user } = await scenario();
    const result = await processNotificationQueue();
    assert.equal(result.emailsSent, 1);
    const email = lastEmailTo(user.email);
    assert.ok(email);
    assert.match(email!.subject, /Site Reliability Engineer at Notify Co/);
    assert.equal((await pending(user.id)).length, 0);
    const [row] = await db.select({ last: users.lastDigestSentAt }).from(users).where(eq(users.id, user.id));
    assert.ok(row.last);

    // Nothing is sent twice.
    assert.equal((await processNotificationQueue()).emailsSent, 0);
  });

  test('an address waiting for approval is held, not dropped', async () => {
    const { user } = await scenario({ approved: false });
    const result = await processNotificationQueue();
    assert.equal(result.emailsSent, 0);
    assert.ok(result.deferred.some(item => /approve/.test(item.reason)));
    assert.equal((await pending(user.id)).length, 1, 'still pending');

    await db.insert(emailApprovals).values({ email: user.email, userId: user.id, status: 'approved' }).onConflictDoUpdate({ target: emailApprovals.email, set: { status: 'approved' } });
    assert.equal((await processNotificationQueue()).emailsSent, 1, 'delivered once approved');
  });

  test('alerts for jobs that closed before delivery are discarded', async () => {
    const { user, job } = await scenario();
    await db.update(jobs).set({ status: 'closed' }).where(eq(jobs.id, job.id));
    assert.equal((await processNotificationQueue()).emailsSent, 0);
    assert.equal((await pending(user.id)).length, 0);
  });

  test('scraped text is escaped in the email', async () => {
    const { user } = await scenario({ title: '<img src=x onerror=alert(1)> Engineer' });
    await processNotificationQueue();
    const email = lastEmailTo(user.email)!;
    assert.ok(!email.html.includes('<img src=x'), 'markup is not injected');
    assert.ok(email.html.includes('&lt;img src=x'));
  });

  test('removing a job as spam cancels its pending alerts and hides it', async () => {
    const { user, job } = await scenario();
    const admin = await createUser({ role: 'admin' });
    await hideJobs({ id: admin.id, email: admin.email, role: 'admin' }, [job.id], 'Spam posting', { headers: new Headers() });
    assert.equal((await pending(user.id)).length, 0);
    const feed = await call<unknown[]>(jobsRoute.GET, { cookie: user.cookie, url: '/api/jobs?view=all' });
    assert.equal(feed.body.data!.length, 0);
  });

  test('one-click unsubscribe turns alerts off without signing in', async () => {
    const { user } = await scenario();
    const { oneClick } = unsubscribeLinks(user.id);
    const result = await call(unsubscribe.POST, { url: new URL(oneClick).pathname + new URL(oneClick).search, body: {} });
    assert.equal(result.status, 200);
    const [row] = await db.select({ enabled: users.emailNotificationsEnabled }).from(users).where(eq(users.id, user.id));
    assert.equal(row.enabled, false);

    const forged = await call(unsubscribe.POST, { url: '/api/unsubscribe?token=forged.token', body: {} });
    assert.equal(forged.status, 400);
  });
});

describe('Tracker', () => {
  beforeEach(resetData);

  test('saving a job puts it in the tracker; dismissing hides it from the feed', async () => {
    const { user, job } = await scenario();
    const saved = await call(jobRoute.PUT, { cookie: user.cookie, method: 'PUT', params: { id: job.id }, body: { status: 'applied', notes: 'Referred by Rahim' } });
    assert.equal(saved.status, 200);
    const tracker = await call<{ title: string; status: string; appliedAt: string | null }[]>(trackerRoute.GET, { cookie: user.cookie });
    assert.equal(tracker.body.data![0].status, 'applied');
    assert.ok(tracker.body.data![0].appliedAt, 'applied date recorded automatically');

    await call(jobRoute.PUT, { cookie: user.cookie, method: 'PUT', params: { id: job.id }, body: { status: 'dismissed' } });
    const feed = await call<unknown[]>(jobsRoute.GET, { cookie: user.cookie, url: '/api/jobs?view=all' });
    assert.equal(feed.body.data!.length, 0);
    const dismissed = await call<unknown[]>(jobsRoute.GET, { cookie: user.cookie, url: '/api/jobs?view=dismissed' });
    assert.equal(dismissed.body.data!.length, 1);
  });

  test('jobs found elsewhere can be tracked too', async () => {
    const user = await createUser();
    const created = await call(trackerRoute.POST, { cookie: user.cookie, body: { title: 'Product Designer', companyName: 'Elsewhere Ltd', url: 'javascript:alert(1)', status: 'saved' } });
    assert.equal(created.status, 201);
    const tracker = await call<{ url: string | null; external: boolean }[]>(trackerRoute.GET, { cookie: user.cookie });
    assert.equal(tracker.body.data![0].url, null, 'unsafe links are not stored');
    assert.equal(tracker.body.data![0].external, true);
  });

  test("another user's job cannot be tracked", async () => {
    const { job } = await scenario();
    const stranger = await createUser();
    const result = await call(jobRoute.PUT, { cookie: stranger.cookie, method: 'PUT', params: { id: job.id }, body: { status: 'saved' } });
    assert.equal(result.status, 404);
  });
});
