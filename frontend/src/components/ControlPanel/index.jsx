'use client';

import { useState } from 'react';
import SpeechTab from './SpeechTab.jsx';
import IdleTab from './IdleTab.jsx';

const TABS = [
  { id: 'speech', label: 'Speech', Component: SpeechTab },
  { id: 'idle', label: 'Idle', Component: IdleTab },
];

export default function ControlPanel({ vrm }) {
  const [active, setActive] = useState('speech');
  const Active = TABS.find((t) => t.id === active)?.Component ?? SpeechTab;

  return (
    <div className="flex h-full flex-col">
      <nav className="flex shrink-0 flex-wrap border-b border-zinc-800">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`px-3 py-2 text-xs transition-colors ${
              active === id
                ? 'border-b-2 border-zinc-200 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Active vrm={vrm} />
      </div>
    </div>
  );
}
