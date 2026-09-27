'use client';

import { useAvatarStore } from '@/stores/avatarStore.js';
import { thumbUrlFor } from '@/lib/backgroundLibrary.js';

/**
 * The room's colour, on screen before anything has loaded.
 *
 * All the reasoning lives on `.stage-poster` in globals.css — what it is, why it
 * is blurred, and why it needs no load state to know when to leave.
 *
 * ITS OWN COMPONENT RATHER THAN A DIV IN AvatarStage, for one reason: it reads
 * `room` from the store, and reading it in AvatarStage would re-render the whole
 * stage — Canvas subtree included — every time somebody picks a room. Harmless
 * today and exactly the sort of thing that stops being harmless later. Room.jsx
 * is its own component for the same reason.
 */
export default function StagePoster() {
  const room = useAvatarStore((s) => s.room);
  const thumb = thumbUrlFor(room);
  if (!thumb) return null;

  return (
    <div
      aria-hidden="true"
      className="stage-poster"
      style={{ backgroundImage: `url(${thumb})` }}
    />
  );
}
