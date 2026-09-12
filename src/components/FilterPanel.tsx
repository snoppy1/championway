import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import {
  PRIZE_CEILING, levelLabels, regionLabels, rewardLabels, teamSizeOptions, timingOptions, typeLabels,
} from '../data/competitions';
import type {
  Filters, Level, OpportunityType, Region, Reward, TeamSizeId, TimingId,
} from '../data/competitions';
import { toggle } from '../data/filters';

type Option<T extends string> = { id: T; label: string };

function entries<T extends string>(labels: Record<T, string>) {
  return (Object.entries(labels) as [T, string][]).map(([id, label]) => ({ id, label }));
}

function CheckGroup<T extends string>({ legend, options, selected, onToggle }: {
  legend: string; options: Option<T>[]; selected: T[]; onToggle: (value: T) => void;
}) {
  return <fieldset className="filter-group">
    <legend>{legend}</legend>
    <div className="filter-options">
      {options.map((option) => <label className="filter-check" key={option.id}>
        <input
          type="checkbox" checked={selected.includes(option.id)}
          onChange={() => onToggle(option.id)}
        />
        <span>{option.label}</span>
      </label>)}
    </div>
  </fieldset>;
}

const baht = new Intl.NumberFormat('th-TH');

export function FilterPanel({ open, filters, count, onChange, onClear, onClose }: {
  open: boolean;
  filters: Filters;
  count: number;
  onChange: (filters: Filters) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  // <dialog> แบบ modal ให้ focus trap, ปุ่ม Esc และการปิดฉากหลังมาให้เอง
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const patch = (change: Partial<Filters>) => onChange({ ...filters, ...change });

  return <dialog className="filter-dialog" ref={dialog} aria-labelledby="filter-title" onClose={onClose}>
    <div className="filter-head">
      <h2 id="filter-title">ตัวกรอง</h2>
      <button type="button" className="icon-button" onClick={onClose} aria-label="ปิดตัวกรอง"><X size={18} /></button>
    </div>

    <div className="filter-body">
      <CheckGroup
        legend="ประเภทโอกาส" options={entries<OpportunityType>(typeLabels)} selected={filters.types}
        onToggle={(value) => patch({ types: toggle(filters.types, value) })}
      />
      <CheckGroup
        legend="ระดับการศึกษา" options={entries<Level>(levelLabels)} selected={filters.levels}
        onToggle={(value) => patch({ levels: toggle(filters.levels, value) })}
      />
      <CheckGroup
        legend="ภูมิภาค" options={entries<Region>(regionLabels)} selected={filters.regions}
        onToggle={(value) => patch({ regions: toggle(filters.regions, value) })}
      />
      <CheckGroup
        legend="ขนาดทีม" options={teamSizeOptions.map(({ id, label }) => ({ id, label }))} selected={filters.teamSizes}
        onToggle={(value: TeamSizeId) => patch({ teamSizes: toggle(filters.teamSizes, value) })}
      />

      <fieldset className="filter-group">
        <legend>เงินรางวัล</legend>
        <div className="prize-inputs">
          <label>
            ต่ำสุด
            <input
              type="number" min={0} max={PRIZE_CEILING} step={10000} value={filters.prizeMin}
              onChange={(event) => patch({ prizeMin: Math.min(Number(event.target.value) || 0, filters.prizeMax) })}
            />
          </label>
          <label>
            สูงสุด
            <input
              type="number" min={0} max={PRIZE_CEILING} step={10000} value={filters.prizeMax}
              onChange={(event) => patch({ prizeMax: Math.max(Number(event.target.value) || 0, filters.prizeMin) })}
            />
          </label>
        </div>
        <label className="prize-slider">
          <span>เงินรางวัลสูงสุดไม่เกิน {baht.format(filters.prizeMax)} บาท{filters.prizeMax >= PRIZE_CEILING ? ' (ไม่จำกัด)' : ''}</span>
          <input
            type="range" min={0} max={PRIZE_CEILING} step={10000} value={filters.prizeMax}
            onChange={(event) => patch({ prizeMax: Math.max(Number(event.target.value), filters.prizeMin) })}
          />
        </label>
      </fieldset>

      <CheckGroup
        legend="รางวัลอื่นนอกจากเงิน" options={entries<Reward>(rewardLabels)} selected={filters.rewards}
        onToggle={(value) => patch({ rewards: toggle(filters.rewards, value) })}
      />

      <fieldset className="filter-group">
        <legend>ค่าสมัคร</legend>
        <div className="filter-options">
          <label className="filter-check">
            <input type="checkbox" checked={filters.freeOnly} onChange={() => patch({ freeOnly: !filters.freeOnly })} />
            <span>เฉพาะงานที่สมัครฟรี</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="filter-group">
        <legend>ช่วงเวลารับสมัคร</legend>
        <div className="filter-options">
          {[{ id: '' as const, label: 'ไม่จำกัด' }, ...timingOptions].map((option) => <label className="filter-check" key={option.id || 'any'}>
            <input
              type="radio" name="timing" checked={filters.timing === option.id}
              onChange={() => patch({ timing: option.id as TimingId | '' })}
            />
            <span>{option.label}</span>
          </label>)}
        </div>
      </fieldset>
    </div>

    <div className="filter-foot">
      <button type="button" className="ghost-button" onClick={onClear}>ล้างทั้งหมด</button>
      <button type="button" className="primary-button" onClick={onClose}>ดูผลลัพธ์ {count} รายการ</button>
    </div>
  </dialog>;
}
