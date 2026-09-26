import { useSearchParams } from 'react-router-dom';
import {
  Briefcase, CodeXml, GraduationCap, LayoutGrid, Lightbulb, Stethoscope, TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { kinds, kindKeys, themeKeys, themes, type Kind, type Theme } from '../data/focus';
import './competition-type-filter.css';

/* ไอคอนอยู่ที่นี่ ไม่ได้อยู่ใน data/focus.ts เพราะไฟล์นั้นเซิร์ฟเวอร์ก็นำเข้าไปใช้
   (server/routes/journey.ts และ auth.ts) จะเอา component ของ React ไปวางไว้ไม่ได้

   ทุกไอคอนเป็น aria-hidden ชื่อที่โปรแกรมอ่านหน้าจอได้จึงยังเป็นข้อความของปุ่มเพียว ๆ */
const kindIcons: Record<Kind, LucideIcon> = {
  hackathon: CodeXml,
  case_competition: Briefcase,
};
const themeIcons: Record<Theme, LucideIcon> = {
  innovation: Lightbulb,
  business: TrendingUp,
  education: GraduationCap,
  medical: Stethoscope,
};

export function CompetitionTypeFilter() {
  const [params, setParams] = useSearchParams();
  const rawKind = params.get('kind') as Kind;
  const kind = kindKeys.includes(rawKind) ? rawKind : null;
  const selected = (params.get('theme') ?? '').split(',').filter((key): key is Theme => themeKeys.includes(key as Theme));
  const expanded = kind !== null;

  function change(type: Kind | null, theme: Theme[] = []) {
    const next = new URLSearchParams(params);
    for (const key of ['kind', 'theme', 'cat', 'category', 'page']) next.delete(key);
    if (type) next.set('kind', type);
    if (theme.length) next.set('theme', theme.join(','));
    setParams(next, { preventScrollReset: true });
  }

  return <div className="competition-type-filter">
    <div className="type-buttons" role="group" aria-label="ประเภทการแข่งขัน">
      {/* "ทั้งหมด" คือค่าตั้งต้น ติดอยู่เมื่อยังไม่เลือกประเภท เพื่อให้เห็นว่ากำลังดูทุกเวที
          ไม่ใช่ปล่อยให้ทั้งแถวดูไม่มีอะไรถูกเลือก */}
      <button
        type="button"
        className={kind === null ? 'tab-button active' : 'tab-button'}
        aria-pressed={kind === null}
        onClick={() => change(null)}
      >
        <LayoutGrid size={16} aria-hidden="true" />ทั้งหมด
      </button>
      {kindKeys.map((id) => {
        const Icon = kindIcons[id];
        return <button
          key={id} type="button"
          className={kind === id ? 'tab-button active' : 'tab-button'}
          aria-pressed={kind === id}
          aria-expanded={kind === id}
          aria-controls={expanded ? 'competition-subtypes' : undefined}
          onClick={() => change(kind === id ? null : id)}
        >
          <Icon size={16} aria-hidden="true" />{kinds[id]}
        </button>;
      })}
    </div>

    {expanded && <div className="subtype-reveal" id="competition-subtypes" key={kind}>
      <div className="subtype-options" role="group" aria-label={`หมวดย่อย ${kinds[kind!]}`}>
        {themeKeys.map((id) => {
          const Icon = themeIcons[id];
          return <button
            key={id} type="button"
            className={selected.includes(id) ? 'tab-button active' : 'tab-button'}
            aria-pressed={selected.includes(id)}
            onClick={() => change(kind, selected.includes(id)
              ? selected.filter((item) => item !== id)
              : [...selected, id])}
          >
            <Icon size={15} aria-hidden="true" />{themes[id]}
          </button>;
        })}
      </div>
      {/* ปุ่ม "ทั้งหมด" ล้างทั้งประเภทและหมวดอยู่แล้ว ปุ่มนี้จึงเหลือหน้าที่เดียว
          คือล้างเฉพาะหมวดย่อยแต่คงประเภทไว้ และขึ้นเฉพาะตอนที่มีหมวดให้ล้างจริง */}
      {selected.length > 0 && <button type="button" className="link-button type-reset" onClick={() => change(kind)}>
        ล้างหมวดย่อย
      </button>}
    </div>}
  </div>;
}
