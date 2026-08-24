import { getRedisClient } from '../lib/redis/client';

async function testRedisQuota() {
  console.log('--- TESTING REDIS QUOTA METRICS ---');
  const redis = getRedisClient();
  if (!redis) {
    console.log('Redis client not available');
    process.exit(0);
  }

  try {
    const keys = await redis.keys('*');
    console.log(`[Redis Keys Count]: ${keys.length}`);
    console.log(`[Redis Keys Sample]:`, keys.slice(0, 10));
  } catch (err: any) {
    console.error('[Redis Keys Error]', err.message);
  }

  process.exit(0);
}

testRedisQuota();
