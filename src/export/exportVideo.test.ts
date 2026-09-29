import { afterEach, expect, it, vi } from 'vitest';
import { exportVideo } from './exportVideo';
import { DEFAULT_SETTINGS } from '../rendering/settings';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('reports unsupported recording without starting media', async () => {
  vi.stubGlobal('MediaRecorder', undefined);
  await expect(exportVideo('blob:source', DEFAULT_SETTINGS, 'shape', new AbortController().signal, vi.fn())).rejects.toThrow('unavailable');
});

it('releases the decoder and listeners when loading is cancelled', async () => {
  vi.stubGlobal('MediaRecorder', class { static isTypeSupported = () => true; });
  Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: vi.fn() });
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const remove = vi.spyOn(document, 'removeEventListener');
  const controller = new AbortController();
  const result = exportVideo('blob:source', DEFAULT_SETTINGS, 'shape', controller.signal, vi.fn());
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(load).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  expect((load.mock.instances[0] as HTMLMediaElement).getAttribute('src')).toBeNull();
  delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>).captureStream;
});
