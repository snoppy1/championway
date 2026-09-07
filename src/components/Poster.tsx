import type { Competition } from '../data/competitions';

export function Poster({ competition }: { competition: Competition }) {
  const { category, cover, id } = competition;
  return (
    <div className={`poster poster--${category} poster--v${cover.variant}`} aria-hidden="true">
      <svg className="poster-art" viewBox="0 0 200 220" fill="none">
        {category === 'business' && <>
          <path d="M200 0H116L0 146v74h72L200 58Z" fill="currentColor" opacity=".26" />
          <path d="m125 0-49 64h71l-48 65h70l31-41V0Z" fill="var(--paper)" opacity=".75" />
        </>}
        {category === 'technology' && <>
          <path d="M0 0h137L0 167Z" fill="currentColor" opacity=".2" />
          <path d="M200 220H69L200 65Z" fill="currentColor" opacity=".15" />
          <path d="m159 22 17 17-17 17m-30-34-17 17 17 17" stroke="currentColor" strokeWidth="2" />
        </>}
        {category === 'innovation' && <>
          <path d="M106-28C1 68 10 145 70 256h94C68 151 60 86 160-28Z" fill="var(--paper)" opacity=".8" />
          <path d="M215-20C124 65 128 147 219 227" stroke="currentColor" strokeWidth="1" opacity=".3" />
          <circle cx="160" cy="34" r="14" stroke="currentColor" opacity=".5" />
          <path d="M160 12v44m-22-22h44" stroke="currentColor" opacity=".5" />
        </>}
        {category === 'creative' && <>
          <circle cx="160" cy="38" r="86" fill="currentColor" opacity=".12" />
          <path d="m155 88 13 36 37 12-37 13-13 36-12-36-37-13 37-12Z" fill="var(--paper)" opacity=".9" />
          <path d="M-20 218 111 77" stroke="currentColor" strokeWidth="36" opacity=".1" />
        </>}
      </svg>
      <div className="poster-edition">CW — {id.slice(-2)}</div>
      <div className="poster-type">{cover.lines.map((line) => <span key={line}>{line}</span>)}</div>
      <div className="poster-caption">A SPACE TO BEGIN ↗</div>
    </div>
  );
}
