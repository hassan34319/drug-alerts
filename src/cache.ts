// A small read-through cache on DynamoDB.
// "Read-through": ask the cache first; on a miss, compute the value (call the FDA), save it, return it.
//
// Table (created by Terraform in infra/main.tf):
//   pk        string  e.g. "report#hydromorphone"
//   data      the cached value (any JSON)
//   expiresAt number  Unix seconds; DynamoDB's TTL deletes the item some time after this
//
// With no CACHE_TABLE env var (your laptop, try.ts, the stdio MCP server) caching is off
// and every call goes straight to the FDA, so local development needs no AWS at all.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

/** Where cached values live. DynamoDB in production; tests can pass an in-memory version. */
export interface CacheStore {
  get(pk: string): Promise<{ data: unknown; expiresAt: number } | undefined>;
  put(pk: string, data: unknown, expiresAt: number): Promise<void>;
}

export function dynamoStore(tableName: string): CacheStore {
  // The DocumentClient converts plain JS objects to DynamoDB's typed format and back.
  // removeUndefinedValues: our reports have optional fields that may be undefined, which DynamoDB rejects.
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return {
    async get(pk) {
      const { Item } = await db.send(new GetCommand({ TableName: tableName, Key: { pk } }));
      return Item ? { data: Item.data, expiresAt: Number(Item.expiresAt) } : undefined;
    },
    async put(pk, data, expiresAt) {
      await db.send(new PutCommand({ TableName: tableName, Item: { pk, data, expiresAt } }));
    },
  };
}

// DynamoDB items max out at 400 KB. Leave headroom for the key and attribute names.
const MAX_BYTES = 350_000;

let store: CacheStore | null | undefined; // undefined = not decided yet, null = caching off

function getStore(): CacheStore | null {
  if (store === undefined) {
    const table = process.env.CACHE_TABLE;
    store = table ? dynamoStore(table) : null;
  }
  return store;
}

/** For tests: swap in another store (or null to turn caching off). */
export function setCacheStore(s: CacheStore | null) {
  store = s;
}

/**
 * Return the cached value for `pk` if it hasn't expired; otherwise run `compute`, cache its result, return it.
 * `ttlSeconds` may be a function of the result, so different outcomes can live for different times.
 * Cache failures are logged and ignored: a broken cache must never break a lookup.
 */
export async function cached<T>(
  pk: string,
  ttlSeconds: number | ((value: T) => number),
  compute: () => Promise<T>,
): Promise<T> {
  const s = getStore();
  if (!s) return compute();

  const now = Math.floor(Date.now() / 1000);

  try {
    const hit = await s.get(pk);
    // TTL deletion can lag by hours, so we check expiresAt ourselves too.
    if (hit && hit.expiresAt > now) return hit.data as T;
  } catch (err) {
    console.error(`cache get failed for ${pk}:`, err); // console.error, never console.log (stdio rule)
  }

  const value = await compute();

  try {
    const size = Buffer.byteLength(JSON.stringify(value));
    if (size <= MAX_BYTES) {
      const ttl = typeof ttlSeconds === "function" ? ttlSeconds(value) : ttlSeconds;
      await s.put(pk, value, now + ttl);
    } else {
      console.error(`cache skip for ${pk}: ${size} bytes is over the item limit`);
    }
  } catch (err) {
    console.error(`cache put failed for ${pk}:`, err);
  }

  return value;
}

export const HOUR = 60 * 60;
export const DAY = 24 * HOUR;
