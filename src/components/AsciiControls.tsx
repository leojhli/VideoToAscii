import { useState } from 'react';
import { DEFAULT_SETTINGS, LIMITS } from '../rendering/settings';
import type { AsciiSettings } from '../rendering/settings';
import { DEFAULT_CHARACTERS, normalizeCharacters } from '../rendering/glyphAtlas';

type Props = { settings: AsciiSettings; maxColumns: number; onChange: (next: AsciiSettings) => void; onReset: () => void };
const presets = { Detailed: DEFAULT_CHARACTERS, Classic: ' .:-=+*#%@', Binary: ' 01', Minimal: ' .oO@' };
export function AsciiControls({ settings, maxColumns, onChange, onReset }: Props) {
  const [draft, setDraft] = useState(settings.characterSet);
  const [error, setError] = useState('');
  const sliders = [
    ['columns', 'Resolution (columns)', 1], ['brightness', 'Brightness', .05],
    ['contrast', 'Contrast', .05], ['gamma', 'Gamma', .05], ['opacity', 'Opacity', .05],
  ] as const;
  return (
    <section className="ascii-controls" aria-label="ASCII settings">
      <div className="controls-heading"><h2>Image controls</h2><button className="text-button" onClick={() => {
        setDraft(DEFAULT_SETTINGS.characterSet); setError(''); onReset();
      }}>Reset settings</button></div>
      <div className="sliders">
        {sliders.map(([key, label, step]) => <div className="slider-control" key={key}>
          <label htmlFor={`setting-${key}`}>{label} <span aria-hidden="true">{settings[key]}</span></label>
          <input id={`setting-${key}`} type="range" min={key === 'columns' ? Math.min(20, maxColumns) : LIMITS[key][0]} max={key === 'columns' ? maxColumns : LIMITS[key][1]} step={step} value={settings[key]}
            onChange={(event) => onChange({ ...settings, [key]: Number(event.currentTarget.value) })} />
        </div>)}
      </div>
      <p className="hint">Fullscreen maximum: {maxColumns} columns on this screen. The smaller preview may use fewer columns to keep characters readable.</p>
      <div className="color-controls">
        <label>Color mode <select value={settings.colorMode} onChange={(event) => onChange({ ...settings, colorMode: event.currentTarget.value as AsciiSettings['colorMode'] })}>
          <option value="color">Original color</option><option value="monochrome">Monochrome</option>
        </select></label>
        <label>Foreground color <input type="color" value={settings.foregroundColor} disabled={settings.colorMode !== 'monochrome'} onChange={(event) => onChange({ ...settings, foregroundColor: event.currentTarget.value })} /></label>
        <label>Background color <input type="color" value={settings.backgroundColor} onChange={(event) => onChange({ ...settings, backgroundColor: event.currentTarget.value })} /></label>
      </div>
      <div className="charset-controls">
        <label>Character preset <select value={Object.entries(presets).find(([, value]) => value === settings.characterSet)?.[0] ?? 'Custom'} onChange={(event) => {
          const value = presets[event.currentTarget.value as keyof typeof presets];
          if (value) { setDraft(value); setError(''); onChange({ ...settings, characterSet: value }); }
        }}><option value="Custom" disabled>Custom</option>{Object.keys(presets).map((name) => <option key={name}>{name}</option>)}</select></label>
        <label htmlFor="custom-characters">Custom characters</label>
        <input id="custom-characters" type="text" maxLength={256} value={draft} spellCheck={false} aria-describedby="charset-help" onChange={(event) => setDraft(event.currentTarget.value)} />
        <button className="text-button" onClick={() => {
          try { const value = normalizeCharacters(draft); onChange({ ...settings, characterSet: value }); setDraft(value); setError(''); }
          catch (cause) { setError((cause as Error).message); }
        }}>Apply characters</button>
        <p id="charset-help" className="hint">Printable ASCII only. Spaces count; duplicates are removed. Include a space for empty dark cells.</p>
        {error && <p role="alert" className="error">{error}</p>}
      </div>
    </section>
  );
}
