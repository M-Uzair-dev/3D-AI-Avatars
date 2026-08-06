'use client';

import { MODEL_URL } from '@/lib/constants.js';

export default function MissingModelNotice({ progress, error }) {
  if (error) {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
        <div className="pointer-events-auto max-w-md rounded-lg border border-red-900 bg-zinc-900/95 p-6 text-sm">
          <h2 className="mb-2 font-semibold text-red-400">Could not load the model</h2>
          <p className="mb-3 text-zinc-400">
            Expected a VRM file at{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-zinc-300">
              frontend/public{MODEL_URL}
            </code>
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-xs text-red-300">
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
          <div className="mb-2 text-sm text-zinc-400">
            Loading avatar… {Math.round(progress * 100)}%
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-zinc-400 transition-[width] duration-150"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
