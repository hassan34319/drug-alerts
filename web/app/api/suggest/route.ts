// The search box asks this route for name suggestions as you type.
// The browser calls this site; this route calls the Lambda (cached for a day per prefix).
import { suggestNames } from "@/lib/fda";

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 60);
  if (q.length < 2) return Response.json({ suggestions: [] });
  try {
    return Response.json({ suggestions: await suggestNames(q) });
  } catch {
    return Response.json({ suggestions: [] }); // suggestions are a nicety; never break the search box
  }
}
