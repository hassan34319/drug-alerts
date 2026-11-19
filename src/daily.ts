// Lambda #2: runs once a day, triggered by an EventBridge schedule (no URL, nobody can call it from outside).
import { runDailyCheck } from "./watchService";

export const handler = async () => {
  const apiBaseUrl = process.env.API_BASE_URL; // the public API's address, for the unsubscribe links in emails
  if (!apiBaseUrl) throw new Error("API_BASE_URL is not set");
  const summary = await runDailyCheck(apiBaseUrl.replace(/\/$/, ""));
  console.log(JSON.stringify({ msg: "daily check done", ...summary })); // shows up in CloudWatch Logs
  return summary;
};
