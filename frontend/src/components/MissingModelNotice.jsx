'use client';

import { useAvatarStore } from '@/stores/avatarStore.js';

/**
 * Loading progress, and what to do when the model will not load.
 *
 * This is the only thing a user sees for the first several seconds on a cold
 * cache — the models are ~18 MB — so it is a production surface rather than a
 * development affordance, and it is painted in the stage palette.
 *
 * The error names the model that ACTUALLY failed, read from the store, not the
 * default from constants. Those are the same file only until someone switches
 * models, and an error message that points at the wrong file is worse than a
 * vague one: it sends you to a path that is present and fine.
 */
export default function MissingModelNotice({ progress, error }) {
  const modelUrl = useAvatarStore((s) => s.modelUrl);

  if (error) {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-8">
        <div className="lit-surface pointer-events-auto max-w-md rounded-[var(--radius)] p-6 text-sm">
          <h2 className="mb-2 font-medium text-[var(--text)]">She could not be loaded</h2>
          <p className="mb-3 text-[13px] leading-relaxed text-[var(--text-quiet)]">
            Nothing was readable at{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-[var(--text)]">
              frontend/public{modelUrl}
            </code>
            . Check the file is there and is a VRM.
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-xs text-[var(--text-quiet)]">
            {error}
          </pre>
        </div>
      </div>
    );
  }

  if (progress !== null && progress < 1) {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-56 text-center">
          <div className="mb-2 text-[13px] text-[var(--text-quiet)]">
            Loading… {Math.round(progress * 100)}%
          </div>
          <div className="h-0.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-150"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
