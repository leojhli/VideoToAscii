import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VideoExport } from './VideoExport';
import { exportVideo } from '../export/exportVideo';
import { DEFAULT_SETTINGS } from '../rendering/settings';

vi.mock('../export/exportVideo', () => ({ exportVideo: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const props = { src: 'blob:source', fileName: 'clip.mp4', settings: DEFAULT_SETTINGS, matchingMode: 'shape' as const, disabled: false };

it('saves the generated format and revokes downloads on regeneration and unmount', async () => {
  let next = 0;
  const revoke = vi.fn();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = () => `blob:export-${++next}`;
    static revokeObjectURL = revoke;
  });
  vi.mocked(exportVideo).mockResolvedValue(new Blob(['encoded'], { type: 'video/webm' }));
  const view = render(<VideoExport {...props} />);
  await act(async () => fireEvent.click(screen.getByText('Generate ASCII video')));
  expect(screen.getByText('Save ASCII video').getAttribute('download')).toBe('clip-ascii.webm');
  await act(async () => fireEvent.click(screen.getByText('Generate ASCII video')));
  expect(revoke).toHaveBeenCalledWith('blob:export-1');
  view.unmount();
  expect(revoke).toHaveBeenCalledWith('blob:export-2');
});

it('cancels active work on cancel and unmount', async () => {
  const signals: AbortSignal[] = [];
  vi.mocked(exportVideo).mockImplementation((_src, _settings, _mode, signal) => new Promise((_resolve, reject) => {
    signals.push(signal);
    signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
  }));
  const view = render(<VideoExport {...props} />);
  fireEvent.click(screen.getByText('Generate ASCII video'));
  await act(async () => fireEvent.click(screen.getByText('Cancel export')));
  expect(signals[0].aborted).toBe(true);
  expect(screen.getByText('Export cancelled.')).toBeTruthy();
  fireEvent.click(screen.getByText('Generate ASCII video'));
  await act(async () => view.unmount());
  expect(signals[1].aborted).toBe(true);
});

it('shows recording failures and allows retry', async () => {
  vi.mocked(exportVideo).mockRejectedValue(new Error('Recording unavailable'));
  render(<VideoExport {...props} />);
  await act(async () => fireEvent.click(screen.getByText('Generate ASCII video')));
  expect(screen.getByRole('alert').textContent).toBe('Recording unavailable');
  expect(screen.getByText('Generate ASCII video').hasAttribute('disabled')).toBe(false);
});
