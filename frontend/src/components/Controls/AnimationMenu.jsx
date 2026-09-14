'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAvatarStore } from '@/stores/avatarStore.js';
import { buildAnimationList } from '@/lib/animations.js';
import Popover from './Popover.jsx';
import MenuButton from './MenuButton.jsx';

/**
 * Things she can be asked to do.
 *
 * One list, two mechanisms — see lib/animations.js for the split and why it is
 * hidden here rather than exposed. This component's whole job is the dispatch:
 * a `gesture` row goes to playGesture, a `clip` row to setClip.
 *
 * Both are one-shots that release on their own, so there is no "stop": the row
 * highlights while a clip is running and clears itself when the clip hands the
 * body back. Gestures are brief enough that flagging them would flicker, so
 * they do not.
 */
export default function AnimationMenu() {
  const clipUrl = useAvatarStore((s) => s.clipUrl);
  const setClip = useAvatarStore((s) => s.setClip);
  const setClipWeight = useAvatarStore((s) => s.setClipWeight);
  const playGesture = useAvatarStore((s) => s.playGesture);
  const [files, setFiles] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/animations')
      .then((r) => r.json())
      .then((d) => setFiles(d.files ?? []))
      .catch(() => setFiles([]));
  }, []);

  const rows = useMemo(() => buildAnimationList(files), [files]);
  const close = useCallback(() => setOpen(false), []);

  const play = (row) => {
    if (row.kind === 'clip') {
      // Selecting and then blending was two steps for one intent. The weight
      // goes to 1 with the selection; clipEnvelope still eases both ends.
      setClip(row.url);
      setClipWeight(1);
    } else {
      playGesture(row.id);
    }
    close();
  };

  return (
    <Popover
      open={open}
      onClose={close}
      trigger={
        <MenuButton
          open={open}
          onClick={() => setOpen((v) => !v)}
          label="Animate"
        />
      }
    >
        {rows.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-[var(--text-quiet)]">
            Nothing to play. Drop a .vrma into public/animations/.
          </p>
        ) : (
          rows.map((row) => {
            const running = row.kind === 'clip' && row.url === clipUrl;
            return (
              <button
                key={row.id}
                onClick={() => play(row)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                  running
                    ? 'bg-white/8 text-[var(--accent)]'
                    : 'text-[var(--text)] hover:bg-white/5'
                }`}
              >
                {row.label}
                {running && (
                  <span className="text-[11px] text-[var(--text-quiet)]">playing</span>
                )}
              </button>
            );
          })
        )}
    </Popover>
  );
}
