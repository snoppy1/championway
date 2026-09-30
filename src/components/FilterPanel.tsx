import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import {
  PRIZE_CEILING, teamSizeOptions, timingOptions,
} from '../data/competitions';
import type {
  Filters, Level, OpportunityType, Region, Reward, TeamSizeId, TimingId,
} from '../data/competitions';
import { toggle } from '../data/filters';
import { useI18n } from '../i18n';
import { formatNumber } from '../i18n/format';

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

export function FilterPanel({ open, filters, count, onChange, onClear, onClose }: {
  open: boolean;
  filters: Filters;
  count: number;
  onChange: (filters: Filters) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const s = t.filters;
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
      <h2 id="filter-title">{s.title}</h2>
      <button type="button" className="icon-button" onClick={onClose} aria-label={s.close}><X size={18} /></button>
    </div>

    <div className="filter-body">
      <CheckGroup
        legend={s.types} options={entries<OpportunityType>(t.taxonomy.types)} selected={filters.types}
        onToggle={(value) => patch({ types: toggle(filters.types, value) })}
      />
      <CheckGroup
        legend={s.levels} options={entries<Level>(t.taxonomy.levels)} selected={filters.levels}
        onToggle={(value) => patch({ levels: toggle(filters.levels, value) })}
      />
      <CheckGroup
        legend={s.regions} options={entries<Region>(t.taxonomy.regions)} selected={filters.regions}
        onToggle={(value) => patch({ regions: toggle(filters.regions, value) })}
      />
      <CheckGroup
        legend={s.teamSize} options={teamSizeOptions.map(({ id }) => ({ id, label: t.taxonomy.teamSizes[id] }))} selected={filters.teamSizes}
        onToggle={(value: TeamSizeId) => patch({ teamSizes: toggle(filters.teamSizes, value) })}
      />

      <fieldset className="filter-group">
        <legend>{s.prize}</legend>
        <div className="prize-inputs">
          <label>
            {s.prizeMin}
            <input
              type="number" min={0} max={PRIZE_CEILING} step={10000} value={filters.prizeMin}
              onChange={(event) => patch({ prizeMin: Math.min(Number(event.target.value) || 0, filters.prizeMax) })}
            />
          </label>
          <label>
            {s.prizeMax}
            <input
              type="number" min={0} max={PRIZE_CEILING} step={10000} value={filters.prizeMax}
              onChange={(event) => patch({ prizeMax: Math.max(Number(event.target.value) || 0, filters.prizeMin) })}
            />
          </label>
        </div>
        <label className="prize-slider">
          <span>{s.prizeSlider(formatNumber(filters.prizeMax, lang))}{filters.prizeMax >= PRIZE_CEILING ? s.unlimited : ''}</span>
          <input
            type="range" min={0} max={PRIZE_CEILING} step={10000} value={filters.prizeMax}
            onChange={(event) => patch({ prizeMax: Math.max(Number(event.target.value), filters.prizeMin) })}
          />
        </label>
      </fieldset>

      <CheckGroup
        legend={s.otherRewards} options={entries<Reward>(t.taxonomy.rewards)} selected={filters.rewards}
        onToggle={(value) => patch({ rewards: toggle(filters.rewards, value) })}
      />

      <fieldset className="filter-group">
        <legend>{s.fee}</legend>
        <div className="filter-options">
          <label className="filter-check">
            <input type="checkbox" checked={filters.freeOnly} onChange={() => patch({ freeOnly: !filters.freeOnly })} />
            <span>{s.freeOnly}</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="filter-group">
        <legend>{s.timing}</legend>
        <div className="filter-options">
          {[{ id: '' as const }, ...timingOptions].map((option) => <label className="filter-check" key={option.id || 'any'}>
            <input
              type="radio" name="timing" checked={filters.timing === option.id}
              onChange={() => patch({ timing: option.id as TimingId | '' })}
            />
            <span>{t.taxonomy.timing[option.id || 'any']}</span>
          </label>)}
        </div>
      </fieldset>
    </div>

    <div className="filter-foot">
      <button type="button" className="ghost-button" onClick={onClear}>{s.clear}</button>
      <button type="button" className="primary-button" onClick={onClose}>{s.showResults(count)}</button>
    </div>
  </dialog>;
}
