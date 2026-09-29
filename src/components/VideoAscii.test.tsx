import { createRef, StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoAscii } from './VideoAscii';
import type { VideoAsciiHandle } from './VideoAscii';
import { createVideoRenderer } from '../rendering/videoRenderer';

vi.mock('../rendering/videoRenderer', () => ({ createVideoRenderer: vi.fn(() => Object.assign(vi.fn(), { updateSettings: vi.fn(), setMode: vi.fn() })) }));
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it('updates appearance and callback props without recreating media or the renderer', () => {
  const first = vi.fn(), second = vi.fn();
  const view = render(<VideoAscii src="/first.mp4" autoPlay={false} columns={60} onTimeChange={first} />);
  const renderer = vi.mocked(createVideoRenderer).mock.results[0].value;
  const video = screen.getByLabelText('ASCII video') as HTMLVideoElement;
  first.mockClear();
  view.rerender(<VideoAscii src="/first.mp4" autoPlay={false} columns={120} gamma={2} onTimeChange={second} />);
  expect(createVideoRenderer).toHaveBeenCalledTimes(1);
  expect(renderer.updateSettings).toHaveBeenLastCalledWith(expect.objectContaining({ columns: 120, gamma: 2 }));
  video.currentTime = 3;
  fireEvent.timeUpdate(video);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith(3);
  expect(video.getAttribute('src')).toBe('/first.mp4');
});

it('releases the old renderer on source replacement and supports an empty source', () => {
  const view = render(<VideoAscii src="/first.mp4" autoPlay={false} />);
  const first = vi.mocked(createVideoRenderer).mock.results[0].value;
  view.rerender(<VideoAscii src="/second.mp4" autoPlay={false} />);
  expect(first).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('ASCII video').getAttribute('src')).toBe('/second.mp4');
  const second = vi.mocked(createVideoRenderer).mock.results[1].value;
  view.rerender(<VideoAscii src="" autoPlay={false} />);
  expect(second).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('ASCII video').hasAttribute('src')).toBe(false);
  expect(createVideoRenderer).toHaveBeenCalledTimes(2);
});

it('supports autoplay, looping, controlled pause and imperative seek', () => {
  const ref = createRef<VideoAsciiHandle>();
  const view = render(<VideoAscii ref={ref} src="/first.mp4" />);
  const video = screen.getByLabelText('ASCII video') as HTMLVideoElement;
  expect(video.loop).toBe(true);
  expect(video.muted).toBe(true);
  expect(video.crossOrigin).toBe('anonymous');
  expect(video.play).toHaveBeenCalled();
  view.rerender(<VideoAscii ref={ref} src="/first.mp4" paused loop={false} />);
  expect(video.pause).toHaveBeenCalled();
  expect(video.loop).toBe(false);
  Object.defineProperty(video, 'duration', { value: 10 });
  ref.current!.seek(99);
  expect(video.currentTime).toBe(10);
  ref.current!.seek(-2);
  expect(video.currentTime).toBe(0);
});

it('reports playback rejection without an unhandled promise', async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('blocked'));
  const error = vi.fn();
  render(<VideoAscii src="/first.mp4" onError={error} />);
  await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining('Playback could not start')));
  expect(screen.getByRole('alert').textContent).toContain('Playback could not start');
});

it('keeps independent instances isolated and cleans up under Strict Mode', () => {
  const view = render(<StrictMode><VideoAscii src="/first.mp4" /><VideoAscii src="/second.mp4" /></StrictMode>);
  view.unmount();
  const renderers = vi.mocked(createVideoRenderer).mock.results.map((result) => result.value);
  expect(renderers.length).toBeGreaterThanOrEqual(2);
  renderers.forEach((renderer) => expect(renderer).toHaveBeenCalledOnce());
});
