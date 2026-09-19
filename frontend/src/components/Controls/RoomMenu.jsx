'use client';

import { useCallback, useState } from 'react';
import { useAvatarStore } from '@/stores/avatarStore.js';
import { BACKGROUND_LIBRARY, getBackground } from '@/lib/backgroundLibrary.js';
import Popover from './Popover.jsx';
import MenuButton from './MenuButton.jsx';

/**
 * Where she is standing.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ON THE BAR WHEN THE MODEL PICKER IS NOT
 * ---------------------------------------------------------------------------
 * ModelNav argues that choosing WHO is on stage is the frame around everything
 * else rather than a setting inside it, which is why it lives on the stage as
 * arrows at the edges. The room is the opposite case and belongs here: it is
 * scenery, you change it rarely, and there is nothing at the edge of the screen
 * for an arrow to point at — the room is already everywhere.
 *
 * ---------------------------------------------------------------------------
 * THUMBNAILS, NOT NAMES
 * ---------------------------------------------------------------------------
 * "Spruit Sunrise" and "Palermo Square" tell you nothing about what either one
 * will do to the picture, and the difference between them is entirely visual:
 * where the light comes from, how hard it is, what colour her shadows go. A
 * 96x54 crop of the actual skybox answers all three before you click.
 *
 * That is what the baked `-thumb.webp` is for. It costs 3-7 KB apiece, which is
 * why all six can be in the DOM at once rather than loaded on open.
 */
export default function RoomMenu() {
  const room = useAvatarStore((s) => s.room);
  const setRoom = useAvatarStore((s) => s.setRoom);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const current = getBackground(room);

  return (
    <Popover
      open={open}
      onClose={close}
      trigger={
        <MenuButton
          open={open}
          onClick={() => setOpen((v) => !v)}
          label="Room"
          value={current?.name}
        />
      }
    >
      {BACKGROUND_LIBRARY.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-[var(--text-quiet)]">
          No rooms baked. Check public/backgrounds/baked/.
        </p>
      ) : (
        BACKGROUND_LIBRARY.map((entry) => {
          const active = entry.id === room;
          return (
            <button
              key={entry.id}
              onClick={() => {
                setRoom(entry.id);
                close();
              }}
              className={`flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors ${
                active ? 'bg-white/8' : 'hover:bg-white/5'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element --
                  a 3 KB static thumb of a known size; the loader would cost a
                  round trip per room to save nothing. */}
              <img
                src={entry.thumbUrl}
                alt=""
                width={64}
                height={36}
                loading="lazy"
                className={`h-9 w-16 shrink-0 rounded-md object-cover ring-1 transition-shadow ${
                  active ? 'ring-[var(--accent)]/70' : 'ring-white/10'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-[13px] ${
                    active ? 'text-[var(--accent)]' : 'text-[var(--text)]'
                  }`}
                >
                  {entry.name}
                </span>
                {entry.blurb && (
                  <span className="block truncate text-[11px] leading-snug text-[var(--text-quiet)]">
                    {entry.blurb}
                  </span>
                )}
              </span>
            </button>
          );
        })
      )}
    </Popover>
  );
}
