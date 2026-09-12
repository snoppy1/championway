import type { CategoryId } from '../data/competitions';

// Placeholder cover art: no photography exists for these fictional events, so each
// category gets its own gradient and mark rather than a grey box.
const palettes: Record<CategoryId, [string, string, string]> = {
  business: ['#DDCBFF', '#F0E4FB', '#F5D95C'],
  technology: ['#CFE0FF', '#E4D8FB', '#D7C4FA'],
  innovation: ['#D7F2E2', '#EDE1FA', '#FFF1B3'],
  design: ['#FFD9E6', '#EDE1FA', '#FFE9A8'],
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
      {category === 'business' && <>
        <path d="M40 140h30v-46H40Zm52 0h30V74H92Zm52 0h30V52h-30Z" fill="#fff" opacity=".62" />
        <path d="M232 44 296 44 296 108" stroke="#6D28D9" strokeWidth="3" fill="none" opacity=".35" />
      </>}
      {category === 'technology' && <>
        <circle cx="242" cy="62" r="34" fill="#fff" opacity=".5" />
        <path d="M44 132h58l26-42 26 64 22-38h46" stroke="#6D28D9" strokeWidth="3" fill="none" opacity=".45" />
      </>}
      {category === 'innovation' && <>
        <circle cx="238" cy="66" r="30" fill="#fff" opacity=".55" />
        <path d="M238 40v52m-26-26h52" stroke="#6D28D9" strokeWidth="3" opacity=".35" />
        <path d="M44 140c34-58 66-58 100 0" stroke="#6D28D9" strokeWidth="3" fill="none" opacity=".3" />
      </>}
      {category === 'design' && <>
        <path d="m250 34 12 34 34 12-34 12-12 34-12-34-34-12 34-12Z" fill="#fff" opacity=".7" />
        <rect x="40" y="86" width="72" height="72" rx="18" fill="#6D28D9" opacity=".18" />
      </>}
    </svg>
  );
}
