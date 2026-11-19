// Lambda #2: runs once a day, triggered by an EventBridge schedule (no URL, nobody can call it from outside).
import { runDailyCheck } from "./watchService";

export const handler = async () => {
  // Where the unsubscribe links in emails point: the website if SITE_URL is set, else the api Lambda.
  const base = process.env.SITE_URL || process.env.API_BASE_URL;
  if (!base) throw new Error("Neither SITE_URL nor API_BASE_URL is set");
  const summary = await runDailyCheck(base.replace(/\/$/, ""));
  console.log(JSON.stringify({ msg: "daily check done", ...summary })); // shows up in CloudWatch Logs

  // If any watcher's email failed, end the run as an error. That fires the CloudWatch alarm, and
  // Lambda's automatic retry tries again: people already emailed are in "notified", so only the
  // failed ones get another attempt, never a duplicate.
  if (summary.failed > 0) throw new Error(`daily check: ${summary.failed} of ${summary.watchers} watchers failed`);
  return summary;
};
