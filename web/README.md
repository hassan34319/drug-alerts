# Drug Alert website

Next.js front end for the FDA Drug Alert API (the Lambda in `../src`).
All FDA calls happen on the Next.js server (`lib/fda.ts`, `app/actions.ts`, `app/api/suggest`);
the browser only talks to this site.

## Run locally

```
# terminal 1, project root: the API with no AWS (in-memory watchlist, emails printed)
npx tsx src/dev-server.ts

# terminal 2
cd web
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000.

## Pages

- `/` search with autocomplete, plus the latest FDA recalls
- `/medicine?q=` shortage and recall report
- `/recalls?days=7|30|90` recall feed
- `/watch` email alert signup
- `/watch/confirm`, `/watch/unsubscribe` the links in alert emails

## Environment

- `FDA_API_URL` the Lambda's URL (required)
