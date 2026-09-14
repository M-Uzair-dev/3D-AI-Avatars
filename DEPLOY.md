# Deploying to Vercel

**The app is in `frontend/`, not at the repository root.** Everything below is
about that one fact.

## The 404

A deployment that **builds successfully and then serves `404: NOT_FOUND` on
every path** is the signature of Vercel looking at the repository root. There is
no `package.json` there, so there is no framework to detect and nothing to
build — the build step "succeeds" by having nothing to do, the repo root is
served as a static directory, and there is no `index.html` in it. Hence a green
build and a 404.

It is not a routing problem, and nothing in the Next app causes it.

## Two ways to fix it, and you only need one

### 1. Set the Root Directory (preferred)

In the Vercel dashboard: **Project → Settings → Build and Deployment → Root
Directory → `frontend`**, then redeploy.

This is the supported path for an app in a subdirectory. Vercel then treats
`frontend/` as the project root and every native Next.js integration works with
no configuration at all — the App Router, the API routes as serverless
functions, and the framework detection.

With the Root Directory set, the `vercel.json` at the repo root is **ignored**,
because Vercel reads `vercel.json` from the root directory. That is fine, and it
is why keeping both costs nothing.

### 2. The `vercel.json` at the repo root

Already committed. It builds `frontend/` from a repo-root deployment:

```json
{
  "framework": "nextjs",
  "installCommand": "npm install --prefix frontend",
  "buildCommand": "npm run build --prefix frontend",
  "outputDirectory": "frontend/.next"
}
```

Use this if you would rather not touch the dashboard. **It has not been run
against Vercel's builder** — the local build it wraps is green, and the file is
the documented shape for the case, but the deployment itself is unverified.
Option 1 is the one with no unknowns in it.

## Environment variables

Set in **Project → Settings → Environment Variables**. `.env.local` is
gitignored and never reaches Vercel.

| Variable | Needed for |
|---|---|
| `ELEVENLABS_API_KEY` | her voice — the one that matters |
| `OPENAI_API_KEY` | the second voice provider, optional |

**Without a key nothing breaks.** `/api/tts` answers 503, the client falls back
to mouthing the words silently, and the UI says why. That is the behaviour the
whole project had before it had a voice, so an unconfigured deployment is a
degraded one rather than a broken one.

Restart or redeploy after changing either — they are read at startup.

## What a fresh clone is missing

Three of the eight models and all six animation clips are **not in the
repository**, because their licences forbid redistributing them. See
[frontend/public/ASSETS.md](frontend/public/ASSETS.md).

So a deployment built straight from a clone has five models, an empty Animate
menu and no entrance animation. Nothing errors — the model and clip lists are
built by reading the directories.

To deploy the full cast, put the missing files in `frontend/public/` **in the
build environment**. They cannot be committed. Practical options:

- Host the three models and six clips on object storage and fetch them at
  runtime, which is also the answer to the bundle-size question below.
- Keep a private mirror of the repo with the assets committed there.

## The five committed models are 87 MB

That is unusual for a Vercel deployment and worth knowing before it surprises
you. They are static files in `public/`, so they are served from the CDN rather
than through a function, and the local build handles them fine — but this has
**not** been deployed at that size, and platform limits on deployment size are
the thing most likely to bite.

If it does, the fix is the same one as for the uncommittable assets: move the
`.vrm` files to object storage and point `modelUrl` at them. Nothing in the app
assumes the models are same-origin.

`MAX_RESIDENT` in [frontend/src/lib/carousel.js](frontend/src/lib/carousel.js)
is a separate concern — it bounds how many decoded models sit in memory in the
browser, not how many are deployed.
