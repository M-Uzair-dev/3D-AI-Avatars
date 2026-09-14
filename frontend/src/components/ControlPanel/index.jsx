'use client';

import { useState } from 'react';
import SpeechTab from './SpeechTab.jsx';
import StateTab from './StateTab.jsx';
import StageTab from './StageTab.jsx';
import IdleTab from './IdleTab.jsx';
import ExpressionTab from './ExpressionTab.jsx';
import PoseTab from './PoseTab.jsx';
import DebugTab from './DebugTab.jsx';

const TABS = [
  { id: 'state', label: 'State', Component: StateTab },
  { id: 'speech', label: 'Speech', Component: SpeechTab },
  { id: 'expressions', label: 'Expressions', Component: ExpressionTab },
  { id: 'pose', label: 'Pose', Component: PoseTab },
  { id: 'idle', label: 'Idle', Component: IdleTab },
  { id: 'stage', label: 'Stage', Component: StageTab },
  { id: 'debug', label: 'Debug', Component: DebugTab },
];

export default function ControlPanel({ vrm }) {
  const [active, setActive] = useState('state');
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
