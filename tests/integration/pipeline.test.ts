import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/lib/db/client';
import { careerPages, jobEvents, jobMatches, jobs, monitorTasks, notificationQueue, notifications, scrapeLogs, userJobs, users } from '@/lib/db/schema';
import { backfillMatchesIfEmpty } from '@/lib/monitoring/housekeeping';
import { runScan } from '@/lib/monitoring/pipeline';
import { claimTasks, completeTask, enqueueScan, recoverExpiredLeases } from '@/lib/monitoring/queue';
import { fakeWeb, type FakeWeb } from '../helpers/fake-http';
import { createListWithCompany, createSource, createUser, resetData } from '../helpers/integration';

const BOARD = 'https://boards.greenhouse.io/acme';
const API = 'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true';

interface Posting {
  id: number;
  title: string;
  location?: string;
}

function board(web: FakeWeb, postings: Posting[]) {
  web.set(API, {
    json: {
      jobs: postings.map(posting => ({
        id: posting.id,
        title: posting.title,
        absolute_url: `${BOARD}/jobs/${posting.id}`,
        location: { name: posting.location ?? 'Dhaka' },
        content: `<p>${posting.title} role</p>`,
      })),
    },
  });
}

async function setup() {
  await resetData();
  const user = await createUser();
  const source = await createSource(BOARD, { companyName: 'Acme' });
  const list = await createListWithCompany(user.id, source.id, { keywords: ['engineer'] });
  const web = fakeWeb();
  const scan = (options: { force?: boolean } = {}) => runScan(source.id, { trigger: 'schedule', http: web.client(), ...options });
  const sourceRow = async () => (await db.select().from(careerPages).where(eq(careerPages.id, source.id)))[0];
  return { user, source, list, web, scan, sourceRow };
}

before(resetData);
after(() => closeDb());

describe('Scan lifecycle', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  test('first scan records jobs and matches silently', async () => {
    board(ctx.web, [
      { id: 1, title: 'Backend Engineer' },
      { id: 2, title: 'Frontend Engineer' },
      { id: 3, title: 'Office Manager' },
    ]);
    const result = await ctx.scan();
    assert.equal(result.outcome, 'success');
    assert.equal(result.jobsAdded, 3);

    assert.equal((await db.select().from(notificationQueue)).length, 0, 'jobs already open when a company is added are not "new"');
    assert.equal((await db.select().from(jobMatches).where(eq(jobMatches.userId, ctx.user.id))).length, 2);
    assert.equal((await db.select().from(jobEvents).where(eq(jobEvents.type, 'discovered'))).length, 3);

    const source = await ctx.sourceRow();
    assert.equal(source.status, 'active');
    assert.equal(source.activeJobCount, 3);
    assert.equal(source.atsType, 'greenhouse');
    assert.ok(source.nextCheckAt && source.nextCheckAt > new Date());
  });

  test('an identical result is recorded as unchanged without rewriting jobs', async () => {
    board(ctx.web, [{ id: 1, title: 'Backend Engineer' }]);
    await ctx.scan();
    const second = await ctx.scan();
    assert.equal(second.outcome, 'unchanged');
    assert.equal((await db.select().from(jobs)).length, 1);
  });

  test('new jobs after the first scan are alerted, with an in-app notification', async () => {
    board(ctx.web, [{ id: 1, title: 'Backend Engineer' }]);
    await ctx.scan();
    board(ctx.web, [{ id: 1, title: 'Backend Engineer' }, { id: 4, title: 'Data Engineer' }, { id: 5, title: 'Recruiter' }]);
    const result = await ctx.scan();
    assert.equal(result.jobsAdded, 2);
    assert.equal(result.notificationsQueued, 1, 'only the job that matches "engineer" is queued');

    const queued = await db.select().from(notificationQueue).where(eq(notificationQueue.userId, ctx.user.id));
    assert.equal(queued.length, 1);
    assert.equal(queued[0].listId, ctx.list.id);
    const inbox = await db.select().from(notifications).where(eq(notifications.userId, ctx.user.id));
    assert.equal(inbox.length, 1);
    assert.match(inbox[0].title, /1 new matching job at Acme/);
  });

  test('changes to a posting are recorded as history', async () => {
    board(ctx.web, [{ id: 1, title: 'Backend Engineer', location: 'Dhaka' }]);
    await ctx.scan();
    board(ctx.web, [{ id: 1, title: 'Backend Engineer', location: 'Remote' }]);
    const result = await ctx.scan();
    assert.equal(result.jobsUpdated, 1);
    const [event] = await db.select().from(jobEvents).where(eq(jobEvents.type, 'updated'));
    assert.deepEqual((event.changes as Record<string, unknown>).location, { from: 'Dhaka', to: 'Remote' });
    const [job] = await db.select().from(jobs);
    assert.equal(job.workplaceType, 'remote');
  });

  test('a job closes only after it has been missing from consecutive scans', async () => {
    board(ctx.web, [{ id: 1, title: 'Backend Engineer' }, { id: 2, title: 'QA Engineer' }]);
    await ctx.scan();
    board(ctx.web, [{ id: 1, title: 'Backend Engineer' }]);
    await ctx.scan();
    let [qa] = await db.select().from(jobs).where(eq(jobs.externalId, '2'));
    assert.equal(qa.status, 'active');
    assert.equal(qa.missedScrapes, 1);

    await ctx.scan({ force: true });
    [qa] = await db.select().from(jobs).where(eq(jobs.externalId, '2'));
    assert.equal(qa.status, 'closed');
    assert.ok(await db.select().from(jobEvents).where(and(eq(jobEvents.jobId, qa.id), eq(jobEvents.type, 'closed'))).then(rows => rows.length === 1));

    // And it is recognised, not duplicated, if it comes back.
    board(ctx.web, [{ id: 1, title: 'Backend Engineer' }, { id: 2, title: 'QA Engineer' }]);
    const reopened = await ctx.scan();
    assert.equal(reopened.jobsReopened, 1);
    assert.equal((await db.select().from(jobs)).length, 2);
  });

  test('a sudden mass disappearance is held back as suspicious', async () => {
    board(ctx.web, Array.from({ length: 8 }, (_, index) => ({ id: 100 + index, title: `Engineer ${index + 1}` })));
    await ctx.scan();
    board(ctx.web, []);
    const result = await ctx.scan();
    assert.equal(result.outcome, 'suspicious');
    assert.equal(result.jobsRemoved, 0);
    assert.equal((await ctx.sourceRow()).status, 'degraded');
    const missed = await db.select().from(jobs).where(eq(jobs.missedScrapes, 0));
    assert.equal(missed.length, 8, 'nothing was counted as missing');
  });

  test('failures are recorded, classified and backed off', async () => {
    ctx.web.set(API, { status: 500, body: 'boom' });
    const result = await ctx.scan();
    assert.equal(result.outcome, 'failed');
    assert.equal(result.errorClass, 'http_5xx');

    const source = await ctx.sourceRow();
    assert.equal(source.consecutiveFailures, 1);
    assert.equal(source.lastErrorClass, 'http_5xx');
    assert.ok(source.nextCheckAt!.getTime() > Date.now() + 25 * 60_000, 'backed off at least 30 minutes');
    const [log] = await db.select().from(scrapeLogs).where(eq(scrapeLogs.careerPageId, ctx.source.id));
    assert.equal(log.success, false);
    assert.equal(log.outcome, 'failed');
  });

  test('a job board that does not exist is marked broken quickly', async () => {
    ctx.web.set(API, { status: 404, body: 'gone' });
    await ctx.scan();
    await ctx.scan();
    const source = await ctx.sourceRow();
    assert.equal(source.lastErrorClass, 'not_found_on_ats');
    assert.equal(source.status, 'broken');
  });

  test('scraped markup is stored as text and unsafe links are dropped', async () => {
    ctx.web.set(API, {
      json: { jobs: [{ id: 9, title: '<img src=x onerror=alert(1)> Engineer', absolute_url: 'javascript:alert(1)', location: { name: 'Dhaka' } }] },
    });
    await ctx.scan();
    const [job] = await db.select().from(jobs);
    assert.equal(job.url, null);
    assert.ok(job.title.includes('Engineer'));
  });
});

describe('Notification preferences and upgrade catch-up', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  const inbox = (type: string) => db.select().from(notifications).where(and(eq(notifications.userId, ctx.user.id), eq(notifications.type, type)));

  test('a source that breaks notifies the list owner', async () => {
    ctx.web.set(API, { status: 404, body: 'gone' });
    await ctx.scan();
    await ctx.scan();
    assert.equal((await ctx.sourceRow()).status, 'broken');
    assert.equal((await inbox('source_failed')).length, 1);
  });

  test('no source-failure notification when the owner switched it off', async () => {
    await db.update(users).set({ notificationSettings: { sourceFailures: false } }).where(eq(users.id, ctx.user.id));
    ctx.web.set(API, { status: 404, body: 'gone' });
    await ctx.scan();
    await ctx.scan();
    assert.equal((await ctx.sourceRow()).status, 'broken');
    assert.equal((await inbox('source_failed')).length, 0);
  });

  test('changes to a saved job notify the person tracking it, unless switched off', async () => {
    board(ctx.web, [{ id: 1, title: 'Backend Engineer', location: 'Dhaka' }]);
    await ctx.scan();
    const [job] = await db.select().from(jobs);
    await db.insert(userJobs).values({ userId: ctx.user.id, jobId: job.id, status: 'saved', snapshot: { title: job.title, companyName: 'Acme' } });

    board(ctx.web, [{ id: 1, title: 'Backend Engineer', location: 'Remote' }]);
    await ctx.scan();
    assert.equal((await inbox('job_updated')).length, 1);

    await db.delete(notifications);
    await db.update(users).set({ notificationSettings: { jobChanges: false } }).where(eq(users.id, ctx.user.id));
    board(ctx.web, [{ id: 1, title: 'Backend Engineer', location: 'Berlin' }]);
    await ctx.scan();
    assert.equal((await inbox('job_updated')).length, 0);
  });

  test('matches are rebuilt once for alerts that predate the match table', async () => {
    board(ctx.web, [
      { id: 1, title: 'Backend Engineer' },
      { id: 2, title: 'Office Manager' },
    ]);
    await ctx.scan();
    await db.delete(jobMatches);

    assert.equal(await backfillMatchesIfEmpty(), 1, 'only the job matching "engineer"');
    assert.equal((await db.select().from(jobMatches).where(eq(jobMatches.userId, ctx.user.id))).length, 1);
    assert.equal(await backfillMatchesIfEmpty(), null, 'nothing to do once matches exist');
    assert.equal((await db.select().from(notificationQueue)).length, 0, 'the catch-up never sends alerts');
  });
});

describe('Work queue', () => {
  before(resetData);

  test('a source can only be queued once at a time, and tasks are claimed exactly once', async () => {
    const source = await createSource('https://boards.greenhouse.io/queue-co');
    const first = await enqueueScan(source.id, { trigger: 'schedule' });
    const second = await enqueueScan(source.id, { trigger: 'manual' });
    assert.equal(first.alreadyQueued, false);
    assert.equal(second.alreadyQueued, true);

    const [claimedA, claimedB] = await Promise.all([claimTasks('worker-a', 5), claimTasks('worker-b', 5)]);
    assert.equal(claimedA.length + claimedB.length, 1);
    const task = [...claimedA, ...claimedB][0];
    assert.equal(task.trigger, 'schedule');
    await completeTask(task.id, { ok: true });
    assert.equal((await enqueueScan(source.id, { trigger: 'schedule' })).alreadyQueued, false, 'can be queued again once finished');
  });

  test('tasks abandoned by a crashed worker are returned to the queue', async () => {
    const source = await createSource('https://boards.greenhouse.io/crash-co');
    await enqueueScan(source.id, { trigger: 'manual' });
    const [task] = await claimTasks('doomed-worker', 10).then(tasks => tasks.filter(item => item.careerPageId === source.id));
    await db.update(monitorTasks).set({ leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(monitorTasks.id, task.id));
    const recovered = await recoverExpiredLeases();
    assert.equal(recovered.requeued, 1);
    const [row] = await db.select().from(monitorTasks).where(eq(monitorTasks.id, task.id));
    assert.equal(row.status, 'queued');
  });
});
