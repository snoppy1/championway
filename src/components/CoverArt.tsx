import type { ReactElement } from 'react';
import type { CategoryId } from '../data/competitions';

// Placeholder cover art: no photography exists for these fictional events, so each
// category gets its own gradient rather than a grey box. Thirteen categories would
// mean thirteen drawings, so the categories share five marks grouped by family.
const palettes: Record<CategoryId, [string, string, string]> = {
  writing: ['#F4E7CF', '#FBF3E4', '#F5D95C'],
  performing: ['#F7D6EA', '#F1E2FB', '#E0C2F5'],
  film: ['#D8D2E8', '#EDE8F7', '#B9A8D6'],
  education: ['#D5E7F8', '#EAF1FC', '#C9DCF5'],
  academic: ['#D2DAF6', '#E7E4FB', '#BFC6EE'],
  marketing: ['#FBDBD0', '#FBE9E2', '#F7C6AE'],
  technology: ['#CFE0FF', '#E4D8FB', '#D7C4FA'],
  design: ['#FFD9E6', '#EDE1FA', '#FFE9A8'],
  health: ['#CFEFE4', '#E7F6F0', '#AEE0CD'],
  society: ['#E3D8F8', '#F1EAFC', '#CBB6EE'],
  environment: ['#D7F0CF', '#ECF7E6', '#B4DFA6'],
  food: ['#FBE6C2', '#FCF2DD', '#F6CF8A'],
  business: ['#DDCBFF', '#F0E4FB', '#F5D95C'],
};

type MarkId = 'chart' | 'circuit' | 'spark' | 'leaf' | 'page';
const marks: Record<CategoryId, MarkId> = {
  business: 'chart', marketing: 'chart', academic: 'chart',
  technology: 'circuit', education: 'circuit',
  design: 'spark', performing: 'spark',
  environment: 'leaf', food: 'leaf', health: 'leaf',
  writing: 'page', film: 'page', society: 'page',
};

const ink = '#6D28D9';
const shapes: Record<MarkId, ReactElement> = {
  chart: <>
    <path d="M40 140h30v-46H40Zm52 0h30V74H92Zm52 0h30V52h-30Z" fill="#fff" opacity=".62" />
    <path d="M232 44 296 44 296 108" stroke={ink} strokeWidth="3" fill="none" opacity=".35" />
  </>,
  circuit: <>
    <circle cx="242" cy="62" r="34" fill="#fff" opacity=".5" />
    <path d="M44 132h58l26-42 26 64 22-38h46" stroke={ink} strokeWidth="3" fill="none" opacity=".45" />
  </>,
  spark: <>
    <path d="m250 34 12 34 34 12-34 12-12 34-12-34-34-12 34-12Z" fill="#fff" opacity=".7" />
    <rect x="40" y="86" width="72" height="72" rx="18" fill={ink} opacity=".18" />
  </>,
  leaf: <>
    <path d="M236 102c-38 0-58-22-58-56 38 0 58 22 58 56Zm0 0c38 0 58-22 58-56-38 0-58 22-58 56Z" fill="#fff" opacity=".6" />
    <path d="M44 140c34-58 66-58 100 0" stroke={ink} strokeWidth="3" fill="none" opacity=".3" />
  </>,
  page: <>
    <rect x="212" y="30" width="76" height="100" rx="10" fill="#fff" opacity=".62" />
    <path d="M228 56h44M228 74h44M228 92h28" stroke={ink} strokeWidth="3" opacity=".3" strokeLinecap="round" />
    <circle cx="82" cy="118" r="34" fill={ink} opacity=".16" />
  </>,
};

export function CoverArt({ category, seed }: { category: CategoryId; seed: string }) {
  const [from, middle, to] = palettes[category];
  const id = `cover-${category}-${seed}`;
  return (
    <svg className="cover-art" viewBox="0 0 320 180" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="45%" stopColor={middle} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${id})`} />
      {shapes[marks[category]]}
    </svg>
  );
}
