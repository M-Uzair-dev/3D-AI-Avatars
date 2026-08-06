'use client';

import dynamic from 'next/dynamic';

// three.js touches `window` at import time, so the Canvas subtree must never be
// server-rendered. `ssr: false` is only permitted inside a 'use client' file —
// calling it from a Server Component is an error in the App Router.
const Scene = dynamic(() => import('./Scene.jsx'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-zinc-500">
      Loading scene…
    </div>
  ),
});

export default function AvatarStage() {
  return (
    <div className="flex h-screen w-full flex-col bg-zinc-900 lg:flex-row">
      <div className="relative min-h-0 flex-1">
        <Scene />
      </div>
    </div>
  );
}
