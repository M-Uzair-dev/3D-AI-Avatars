# Deploying to Vercel

The app is in `frontend/`, so **Root Directory must be `frontend`** — Project →
Settings → Build and Deployment. `vercel.json` lives in `frontend/` for the same
reason: Vercel reads it from the root directory, not from the repository root.

## The 404, and what it was not

A deployment that **builds successfully and then serves `404: NOT_FOUND` on
every path** means Vercel built something and then served a directory that has
no `index.html` in it.

The first guess was that Root Directory was unset, pointing the build at the
repository root where there is no `package.json`. **It was already set to
`frontend`.** That guess is recorded here because it is the obvious one and the
next person will make it too: check the setting before acting on it.

What is left, with Root Directory correct and `next` in `dependencies`, is a
**project setting overriding framework detection** — Framework Preset switched
to "Other", or an Output Directory override. Either produces exactly this: the
build command runs and passes, then Vercel serves the output as a static
directory instead of handing it to the Next.js runtime, and there is no
`index.html` to serve.

`frontend/vercel.json` pins the preset, and settings in `vercel.json` take
precedence over the dashboard:

```json
{ "framework": "nextjs" }
```

It is deliberately only that one key. A `buildCommand` or `outputDirectory` here
would override Vercel's native Next.js handling — which is the thing that needs
to work — rather than restore it.

**If it still 404s after this**, the remaining candidates are dashboard
overrides `vercel.json` does not touch. In Settings → Build and Deployment,
clear them back to default:

- **Output Directory** — must be empty/default, not `out`, `dist` or `public`.
- **Build Command** — must be empty/default, or `next build`.
- **Install Command** — must be empty/default.

Then confirm the deployment you are opening is the **production** one and not a
stale alias.

This has been reasoned from the repository and the one dashboard setting that
was visible; **the fix has not been watched deploying.** The local build is
green and the repository contains everything the build needs, which is as far as
anything here can establish.

## Environment variables

Set in **Project → Settings → Environment Variables**. `.env.local` is
gitignored and never reaches Vercel.

| Variable | Needed for |
|---|---|
| `ELEVENLABS_API_KEY` | her voice — the one that matters |
| `OPENAI_API_KEY` | the second voice provider, optional |

**Without a key nothing breaks.** `/api/tts` answers 503, the client falls back
to mouthing the words silently, and the UI says why — the behaviour the whole
project had before it had a voice. An unconfigured deployment is degraded, not
broken.

Both are read at startup, so redeploy after changing either.

## What a fresh clone is missing

Three of the eight models are **not in the repository**, because their own
metadata forbids redistributing them —
[frontend/public/ASSETS.md](frontend/public/ASSETS.md) has the table.

The animation clips **are** committed, for the demo phase only and as a
deliberate exception to their licence. Same file for what that means and what
undoing it takes.

So a deployment built straight from a clone has five models, a full Animate menu
and a working entrance. Nothing errors: the model list is built by reading the
directory.

To deploy the other three the files have to reach the build environment without
passing through git. Either host them on object storage and point at them, or
keep a private mirror with the assets committed there.

## The five committed models are 87 MB

Unusual for a Vercel deployment, and worth knowing before it surprises you.
They are static files in `public/`, so they are served from the CDN rather than
through a function, and the local build handles them — but **this has not been
deployed at that size**, and a platform limit on deployment size is the most
likely thing to bite.

If it does, the fix is the same one as for the uncommittable assets: move the
`.vrm` files to object storage and point `modelUrl` at them. Nothing in the app
assumes the models are same-origin.

`MAX_RESIDENT` in [frontend/src/lib/carousel.js](frontend/src/lib/carousel.js)
is a different question — it bounds how many decoded models sit in browser
memory, not how many are deployed.
