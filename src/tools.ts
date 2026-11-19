import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DISCLAIMER } from "./checkDrug";
import { checkByName, recentAlertsCached } from "./service";
import { requestWatch } from "./watchService";

/**
 * baseUrl: the public address of this server (e.g. https://xxxx.lambda-url.ap-southeast-2.on.aws).
 * The watchlist tool needs it to build the confirm link in the email, so it's only offered when we know it.
 */
export function createServer(opts: { baseUrl?: string } = {}): McpServer {
  const server = new McpServer({ name: "fda-drug-alert", version: "0.1.0" });

  // 2. Register the check_drug tool.
  server.registerTool(
    "check_drug", // the name Claude uses to call the tool: short, snake_case, describes the action
    {
      title: "Check a US medicine for shortages and recalls", // human-friendly label shown in the UI

      // The description is effectively a prompt: Claude reads it to decide WHEN to use the tool
      // and HOW to read the result. Say what it does, what it returns, and its limits.
      description: [
        "Look up a US medicine (brand or generic name) in FDA public data and report:",
        "whether it is in shortage (per strength and form, with the FDA's expected recovery dates",
        "and same-strength products that manufacturers report as available), and its active and past recalls.",
        "If the name matches several different medicines (e.g. 'Tylenol' vs 'Tylenol PM'), the result has",
        "status 'choose' with options: ask the user which one they mean (or pick it if their message already",
        "made it clear), then call again with that option's `ingredients`.",
        "If nothing matches, the result has spelling suggestions: confirm with the user before using one,",
        "since a suggestion can be a different drug.",
        "Data covers the US only. This is not medical advice: never recommend switching or dosing.",
      ].join(" "),

      // inputSchema: what Claude must send. Each field is a zod type plus a .describe() that Claude reads.
      // The SDK turns this into JSON Schema for Claude and validates incoming calls against it.
      inputSchema: {
        name: z
          .string()
          .min(2)
          .describe(
            "Medicine name as the user wrote it, brand or generic, e.g. 'Dilaudid' or 'hydromorphone'",
          ),
        ingredients: z
          .array(z.string())
          .optional()
          .describe(
            "Only when answering a previous 'choose' result: the chosen option's ingredients list, copied exactly",
          ),
      },
    },

    // 3. The handler: runs when Claude calls the tool. Arguments arrive already validated by zod.
    async ({ name, ingredients }) => {
      try {
        // Same function the website uses: identify (or use the chosen ingredients), then the report.
        // "choose" / "not_found" come back as they are, so Claude can ask the user.
        const result = await checkByName(name, ingredients);
        // Compact JSON: Claude reads it fine, and it uses fewer tokens.
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        // isError tells Claude the call failed (e.g. openFDA down), so it says so instead of inventing an answer.
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: `FDA lookup failed: ${message}. ${DISCLAIMER}` }] };
      }
    },
  );

  // 3. Register the recent_alerts tool.
  server.registerTool(
    "recent_alerts", // the name Claude uses to call the tool: short, snake_case, describes the action
    {
      title: "Recent US drug recalls", // human-friendly label shown in the UI

      // The description is effectively a prompt: Claude reads it to decide WHEN to use the tool
      // and HOW to read the result. Say what it does, what it returns, and its limits.
      description: [
        "List recent US drug recalls from FDA public data: either all recalls, or only those for specific medicines.",
        "Use it for questions like 'what drugs were recalled lately?' or 'has anything I take been recalled?'.",
        "The FDA publishes recalls weekly, so the window ends at the FDA's latest update (the `to` date), not today:",
        "tell the user the data is as of that date.",
        "Each alert has the recall class: Class I is the most serious (can cause serious harm or death), so lead with",
        "those; Class II can cause temporary harm; Class III is unlikely to cause harm. Status 'Ongoing' means active.",
        "Names that could not be matched come back in `unresolved`:",
        "status 'choose' means the name covers several different medicines (e.g. 'Tylenol' vs 'Tylenol PM'),",
        "so ask the user which one they mean (or pick it if their message already made it clear), then call again",
        "with that option exactly as written in `options` (e.g. 'acetaminophen + diphenhydramine') in `medicines`;",
        "status 'not_found' comes with spelling suggestions: confirm with the user before using one,",
        "since a suggestion can be a different drug.",
        "Data covers the US only. This is not medical advice: never recommend stopping, switching or dosing;",
        "suggest the user check the lot number on their pack and talk to their pharmacist.",
      ].join(" "),

      // inputSchema: what Claude must send. Each field is a zod type plus a .describe() that Claude reads.
      inputSchema: {
        days: z
          .number()
          .int()
          .min(1)
          .max(90)
          .optional()
          .describe("How many days of recalls to return, counted back from the FDA's latest update. Defaults to 7."),
        medicines: z
          .array(z.string())
          .optional()
          .describe(
            "Optional. Medicine names as the user wrote them, brand or generic (e.g. ['Lipitor', 'metformin']), " +
              "or an option copied exactly from a previous `unresolved` result. Leave out to get all recalls.",
          ),
      },
    },

    // The handler: runs when Claude calls the tool. Arguments arrive already validated by zod.
    async ({ days, medicines }) => {
      try {
        const result = await recentAlertsCached(days, medicines); // days undefined -> the function's default of 7
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        // isError tells Claude the call failed, so it says so instead of inventing an answer.
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: `FDA lookup failed: ${message}. ${DISCLAIMER}` }] };
      }
    },
  );

  // 4. Register the add_to_watchlist tool (only when we know our public address, for the confirm link).
  if (opts.baseUrl) {
    const baseUrl = opts.baseUrl;
    server.registerTool(
      "add_to_watchlist",
      {
        title: "Email me about new recalls for my medicines",
        description: [
          "Sign the user up for email alerts about NEW FDA recalls of specific medicines.",
          "Only use it when the user asks to be notified or to watch their medicines, and only with an email address",
          "the user typed in this conversation: never guess or reuse an address from elsewhere.",
          "Results by `status`:",
          "'confirmation_sent': tell the user to open the email and click Confirm; no alerts are sent until they do",
          "(the link works for 7 days; check spam if it doesn't arrive).",
          "'confirmation_recently_sent': a confirmation went out in the last hour; the medicines were added to it,",
          "ask the user to use that email.",
          "'already_confirmed': already subscribed; `added` lists the medicines newly added (empty if none were new).",
          "'unresolved': nothing was saved; for each entry, status 'choose' means ask which option they mean, then call",
          "again with ALL the medicines, using that option exactly as written; 'not_found' comes with spelling",
          "suggestions to confirm with the user first.",
          "'invalid_email': ask the user to check the address.",
          "'email_failed': the email couldn't be delivered to that address and nothing was saved; ask the user to",
          "check it or use another address.",
          "Alerts cover new recalls only (not ones already published), US only, and are not medical advice.",
          "Every alert email has an unsubscribe link.",
        ].join(" "),
        inputSchema: {
          email: z.string().describe("The user's email address, exactly as they typed it in this conversation"),
          medicines: z
            .array(z.string().min(2))
            .min(1)
            .max(20)
            .describe(
              "Medicine names as the user wrote them, brand or generic (e.g. ['Lipitor', 'metformin']), " +
                "or an option copied exactly from a previous `unresolved` result",
            ),
        },
      },
      async ({ email, medicines }) => {
        try {
          const result = await requestWatch(email, medicines, baseUrl);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { isError: true, content: [{ type: "text", text: `Could not set up alerts: ${message}` }] };
        }
      },
    );
  }

  return server;
}
