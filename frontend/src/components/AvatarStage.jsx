'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import MissingModelNotice from './MissingModelNotice.jsx';
import SpeechInput from './SpeechInput.jsx';

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

const VrmAvatar = dynamic(() => import('./VrmAvatar.jsx'), { ssr: false });

export default function AvatarStage() {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [, setVrm] = useState(null);

  const handleLoaded = useCallback((loaded) => {
    setVrm(loaded);
    setProgress(1);
  }, []);

  return (
    <div className="flex h-screen w-full flex-col bg-zinc-900 lg:flex-row">
      <div className="relative min-h-0 flex-1">
        <Scene>
          <VrmAvatar
            onLoaded={handleLoaded}
            onProgress={setProgress}
            onError={setError}
          />
        </Scene>
        <MissingModelNotice progress={progress} error={error} />
      </div>
      <aside className="w-full shrink-0 overflow-y-auto border-t border-zinc-800 bg-zinc-900 lg:h-screen lg:w-80 lg:border-l lg:border-t-0">
        <SpeechInput />
      </aside>
    </div>
  );
}
