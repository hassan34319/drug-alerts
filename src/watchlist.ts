// Where watchers are stored: the watchlist DynamoDB table (created by Terraform).
//
// One item per person, keyed by email:
//   pk        "watch#<email>"
//   email     the address (lowercased)
//   medicines exact medicine keys, e.g. ["atorvastatin", "acetaminophen + diphenhydramine"]
//   status    "pending" (not confirmed yet) | "confirmed" | "unsubscribed"
//   notified  recall ids this person has already been emailed about (newest kept), so nothing is sent twice
//   createdAt, confirmedAt, lastConfirmationSentAt   Unix seconds
//
// Unlike the cache table, nothing here expires: a watchlist is the user's data.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export type WatchStatus = "pending" | "confirmed" | "unsubscribed";

export type Watcher = {
  email: string;
  medicines: string[];
  status: WatchStatus;
  notified: string[];
  createdAt: number;
  confirmedAt?: number;
  lastConfirmationSentAt?: number;
};

/** The few operations the rest of the code needs. DynamoDB in production, an in-memory map in tests. */
export interface WatchStore {
  get(email: string): Promise<Watcher | undefined>;
  put(w: Watcher): Promise<void>;
  listConfirmed(): Promise<Watcher[]>;
}

const MAX_NOTIFIED = 500; // keep the newest 500 recall ids per person; plenty, and keeps items small

export const normEmail = (e: string) => e.trim().toLowerCase();

export function dynamoWatchStore(tableName: string): WatchStore {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  return {
    async get(email) {
      const { Item } = await db.send(new GetCommand({ TableName: tableName, Key: { pk: `watch#${normEmail(email)}` } }));
      if (!Item) return undefined;
      const { pk: _pk, ...w } = Item;
      return w as Watcher;
    },
    async put(w) {
      const item = { ...w, notified: w.notified.slice(-MAX_NOTIFIED) };
      await db.send(new PutCommand({ TableName: tableName, Item: { pk: `watch#${normEmail(w.email)}`, ...item } }));
    },
    async listConfirmed() {
      // A Scan reads the whole table. Fine for hundreds of watchers; at thousands you'd add an index on status.
      const out: Watcher[] = [];
      let start: Record<string, unknown> | undefined;
      do {
        const page = await db.send(
          new ScanCommand({
            TableName: tableName,
            FilterExpression: "#s = :c",
            ExpressionAttributeNames: { "#s": "status" }, // "status" is a reserved word in DynamoDB expressions
            ExpressionAttributeValues: { ":c": "confirmed" },
            ExclusiveStartKey: start,
          }),
        );
        for (const { pk: _pk, ...w } of page.Items ?? []) out.push(w as Watcher);
        start = page.LastEvaluatedKey;
      } while (start);
      return out;
    },
  };
}

export function memoryWatchStore(): WatchStore & { all: Map<string, Watcher> } {
  const all = new Map<string, Watcher>();
  return {
    all,
    async get(email) {
      const w = all.get(normEmail(email));
      return w && structuredClone(w);
    },
    async put(w) {
      all.set(normEmail(w.email), structuredClone({ ...w, notified: w.notified.slice(-MAX_NOTIFIED) }));
    },
    async listConfirmed() {
      return [...all.values()].filter((w) => w.status === "confirmed").map((w) => structuredClone(w));
    },
  };
}

let store: WatchStore | undefined;
export function getWatchStore(): WatchStore {
  if (!store) {
    const table = process.env.WATCHLIST_TABLE;
    if (!table) throw new Error("WATCHLIST_TABLE is not set");
    store = dynamoWatchStore(table);
  }
  return store;
}
export function setWatchStore(s: WatchStore) {
  store = s;
}
