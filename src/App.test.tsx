import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./rendering/videoRenderer', () => ({ createVideoRenderer: vi.fn(() => vi.fn()) }));

let nextUrl = 0;
const createUrl = vi.fn(() => `blob:test-${++nextUrl}`);
const revokeUrl = vi.fn();

beforeEach(() => {
  nextUrl = 0;
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createUrl;
    static revokeObjectURL = revokeUrl;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function select(file: File) {
  fireEvent.change(screen.getByLabelText('Choose a video'), { target: { files: [file] } });
}

describe('local video selection', () => {
  it('releases replaced and removed URLs and allows choosing the same file again', () => {
    render(<App />);
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
    select(file);
    expect(screen.getByLabelText('Preview of clip.mp4').getAttribute('src')).toBe('blob:test-1');
    select(file);
    expect(revokeUrl).toHaveBeenCalledWith('blob:test-1');
    expect(screen.getByLabelText('Preview of clip.mp4').getAttribute('src')).toBe('blob:test-2');
    fireEvent.click(screen.getByText('Remove video'));
    expect(revokeUrl).toHaveBeenCalledWith('blob:test-2');
    expect(screen.queryByLabelText('Preview of clip.mp4')).toBeNull();
  });

  it('rejects empty and non-video files without losing an existing preview', () => {
    render(<App />);
    select(new File(['video'], 'clip.mp4', { type: 'video/mp4' }));
    select(new File([], 'empty.mp4', { type: 'video/mp4' }));
    expect(screen.getByRole('alert').textContent).toContain('empty');
    select(new File(['text'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert').textContent).toContain('Choose a video');
    expect(screen.getByLabelText('Preview of clip.mp4')).toBeTruthy();
    expect(createUrl).toHaveBeenCalledTimes(1);
  });

  it('lets the decoder handle missing MIME types and reports playback failure', () => {
    render(<App />);
    select(new File(['unknown'], 'unknown.mp4'));
    fireEvent.error(screen.getByLabelText('Preview of unknown.mp4'));
    expect(screen.getByRole('status').textContent).toContain('could not play');
  });

  it('displays decoded dimensions and duration', () => {
    render(<App />);
    select(new File(['video'], 'clip.mp4', { type: 'video/mp4' }));
    const video = screen.getByLabelText('Preview of clip.mp4');
    Object.defineProperties(video, {
      videoWidth: { value: 1920 }, videoHeight: { value: 1080 }, duration: { value: 12.5 },
    });
    fireEvent.loadedMetadata(video);
    expect(screen.getByRole('status').textContent).toContain('1920 × 1080 px · 12.5 seconds');
  });

  it('releases every created URL under Strict Mode and unmount', () => {
    const view = render(<StrictMode><App /></StrictMode>);
    select(new File(['video'], 'clip.mp4', { type: 'video/mp4' }));
    view.unmount();
    expect(createUrl.mock.results.length).toBeGreaterThan(0);
    for (const result of createUrl.mock.results) {
      expect(revokeUrl.mock.calls.filter(([url]) => url === result.value)).toHaveLength(1);
    }
  });
});
