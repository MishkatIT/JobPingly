import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { evaluateJob, explainMatch, matchKeywords, type MatchableJob } from '@/lib/matching/engine';
import { EMPTY_RULES, describeRules, matchRulesSchema, matchesEverything, rulesFromSubscription, type MatchRules } from '@/lib/matching/rules';

const rules = (overrides: Partial<MatchRules>): MatchRules => ({ ...EMPTY_RULES, ...overrides });
const job = (title: string, extra: Partial<MatchableJob> = {}): MatchableJob => ({ title, ...extra });

describe('Keyword matching is whole-word', () => {
  test('"java" does not match JavaScript', () => {
    assert.equal(evaluateJob(job('Senior JavaScript Engineer'), rules({ include: [['java']] })).matched, false);
    assert.equal(evaluateJob(job('Java Backend Engineer'), rules({ include: [['java']] })).matched, true);
  });
  test('"intern" does not match International', () => {
    assert.equal(evaluateJob(job('International Sales Manager'), rules({ include: [['intern']] })).matched, false);
    assert.equal(evaluateJob(job('Software Engineering Intern'), rules({ include: [['intern']] })).matched, true);
  });
  test('spacing and punctuation variants match', () => {
    const frontend = rules({ include: [['frontend']] });
    assert.equal(evaluateJob(job('Front-end Developer'), frontend).matched, true);
    assert.equal(evaluateJob(job('Front End Developer'), frontend).matched, true);
    const node = rules({ include: [['node.js']] });
    assert.equal(evaluateJob(job('NodeJS Engineer'), node).matched, true);
    assert.equal(evaluateJob(job('Node JS Engineer'), node).matched, true);
  });
  test('C++ and C# are distinct terms', () => {
    assert.equal(evaluateJob(job('C++ Developer'), rules({ include: [['c++']] })).matched, true);
    assert.equal(evaluateJob(job('C# Developer'), rules({ include: [['c++']] })).matched, false);
  });
  test('plurals fold', () => {
    assert.equal(evaluateJob(job('Engineers Wanted'), rules({ include: [['engineer']] })).matched, true);
  });
  test('substring mode is available', () => {
    assert.equal(evaluateJob(job('JavaScript Engineer'), rules({ include: [['java']], wholeWord: false })).matched, true);
  });
});

describe('Groups, exclusions and facets', () => {
  test('AND across groups, OR within a group', () => {
    const r = rules({ include: [['react', 'vue'], ['senior', 'lead']] });
    assert.equal(evaluateJob(job('Senior React Engineer'), r).matched, true);
    assert.equal(evaluateJob(job('Lead Vue Developer'), r).matched, true);
    assert.equal(evaluateJob(job('React Engineer'), r).matched, false);
  });
  test('exclusions only look at the title', () => {
    const r = rules({ exclude: ['senior'], fields: ['title', 'description'] });
    assert.equal(evaluateJob(job('Senior Engineer'), r).matched, false);
    assert.equal(evaluateJob(job('Engineer', { description: 'Report to senior leadership' }), r).matched, true);
  });
  test('description is only searched when enabled', () => {
    const withoutDescription = rules({ include: [['kubernetes']] });
    const withDescription = rules({ include: [['kubernetes']], fields: ['title', 'description'] });
    const posting = job('Platform Engineer', { description: 'We run Kubernetes in production.' });
    assert.equal(evaluateJob(posting, withoutDescription).matched, false);
    assert.equal(evaluateJob(posting, withDescription).matched, true);
  });
  test('facets, with unknown values allowed by default', () => {
    const remoteOnly = rules({ workplace: ['remote'] });
    assert.equal(evaluateJob(job('Engineer', { workplaceType: 'remote' }), remoteOnly).matched, true);
    assert.equal(evaluateJob(job('Engineer', { workplaceType: 'onsite' }), remoteOnly).matched, false);
    assert.equal(evaluateJob(job('Engineer', { workplaceType: null }), remoteOnly).matched, true);
    assert.equal(evaluateJob(job('Engineer', { workplaceType: null }), { ...remoteOnly, includeUnknown: false }).matched, false);
  });
  test('location preferences', () => {
    const dhaka = rules({ locations: ['Dhaka'] });
    assert.equal(evaluateJob(job('Engineer', { location: 'Dhaka, Bangladesh' }), dhaka).matched, true);
    assert.equal(evaluateJob(job('Engineer', { location: 'Berlin, Germany' }), dhaka).matched, false);
  });
  test('empty rules match everything and say so', () => {
    const result = evaluateJob(job('Anything'), EMPTY_RULES);
    assert.equal(result.matched, true);
    assert.deepEqual(result.terms, ['*']);
    assert.equal(matchesEverything(EMPTY_RULES), true);
    assert.equal(describeRules(EMPTY_RULES), 'All new jobs');
  });
});

describe('Explanations and compatibility', () => {
  test('a match records which term was found where', () => {
    const result = evaluateJob(job('Backend Engineer', { department: 'Platform' }), rules({ include: [['platform']] }));
    assert.equal(explainMatch(result.reasons), '"platform" in the department');
  });
  test('legacy keyword columns become rules', () => {
    const converted = rulesFromSubscription({ positiveKeywords: ['React', ' react ', 'Vue'], negativeKeywords: ['intern'] });
    assert.deepEqual(converted.include, [['React', 'Vue']]);
    assert.deepEqual(converted.exclude, ['intern']);
  });
  test('a keyword that is only punctuation no longer matches every job', () => {
    assert.equal(matchKeywords(['-'], 'Accountant').isMatch, false);
  });
  test('schema enforces the keyword limit', () => {
    const tooMany = { include: [Array.from({ length: 6 }, (_, index) => `k${index}`)] };
    assert.equal(matchRulesSchema(5).safeParse(tooMany).success, false);
    assert.equal(matchRulesSchema(10).safeParse(tooMany).success, true);
  });
});
