import { useI18n } from '../i18n';
import type { Price } from '../data/consult';

/* ราคาของแต่ละเวที: ฟรี หรือบาทต่อหน่วยที่เมนเทอร์พิมพ์เอง (ต่อชั่วโมง ต่อโปรเจกต์) ไม่มีจำนวนนาทีแล้ว
   ใช้ทั้งใน Mentor zone และกล่องรับปรึกษาบนหน้าเวที */
export function PriceFields({ idPrefix, value, disabled, label, onChange }: {
  idPrefix: string; value: Price; disabled: boolean; label: string; onChange: (next: Price) => void;
}) {
  const { t } = useI18n();
  const p = t.price;
  return <div className="cx-price">
    <div className="cx-price__mode" role="radiogroup" aria-label={label}>
      {(['free', 'paid'] as const).map((mode) => <label key={mode} className={`cx-price__option${value.mode === mode ? ' is-on' : ''}`}>
        <input type="radio" name={`${idPrefix}-mode`} checked={value.mode === mode} disabled={disabled} onChange={() => onChange({ ...value, mode })} />
        <span>{mode === 'free' ? p.free : p.paid}</span>
      </label>)}
    </div>
    {value.mode === 'paid' && <div className="cx-price-fields">
      <div className="cx-field">
        <label htmlFor={`${idPrefix}-price`}>{p.thb}</label>
        <input id={`${idPrefix}-price`} inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={value.price} disabled={disabled}
          onChange={(event) => onChange({ ...value, price: event.target.value.replace(/[^0-9]/g, '') })} />
      </div>
      <div className="cx-field">
        <label htmlFor={`${idPrefix}-unit`}>{p.unit}</label>
        <input id={`${idPrefix}-unit`} maxLength={40} autoComplete="off" placeholder={p.unitPlaceholder} value={value.unit} disabled={disabled}
          onChange={(event) => onChange({ ...value, unit: event.target.value })} />
      </div>
    </div>}
  </div>;
}

export const samePrice = (a: Price, b: Price) => a.mode === b.mode && (a.mode !== 'paid' || (a.price === b.price && a.unit.trim() === b.unit.trim()));
