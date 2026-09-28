import { expect, test } from '@playwright/test';

test('renders a real video upright through WebGL and survives pause, resize, context loss, and removal', async ({ page }) => {
  const exceptions: string[] = [];
  page.on('pageerror', (error) => exceptions.push(error.message));
  await page.goto('/');
  // Generate a local video fixture in the browser; no external media or network dependency.
  const bytes = await page.evaluate(async () => {
    const source = document.createElement('canvas');
    source.width = 320; source.height = 180;
    const context = source.getContext('2d')!;
    const paint = () => {
      context.fillStyle = '#ff0000'; context.fillRect(0, 0, 320, 90);
      context.fillStyle = '#0000ff'; context.fillRect(0, 90, 320, 90);
    };
    paint();
    const stream = source.captureStream(15);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const finished = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    const interval = setInterval(paint, 60);
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 1800));
    recorder.stop();
    await finished;
    clearInterval(interval);
    stream.getTracks().forEach((track) => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  });
  await page.getByLabel('Choose a video').setInputFiles({ name: 'fixture.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();

  async function sample() {
    return page.evaluate(() => {
      const video = document.querySelector('video')!;
      const canvas = document.querySelector('canvas')!;
      // Force a synchronous redraw before reading the non-preserved drawing buffer.
      video.dispatchEvent(new Event('seeked'));
      const gl = canvas.getContext('webgl2')!;
      const top = new Uint8Array(4), bottom = new Uint8Array(4);
      gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height * .6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, top);
      gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height * .4), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bottom);
      return { top: Array.from(top), bottom: Array.from(bottom), gpuError: gl.getError() };
    });
  }
  await expect.poll(async () => (await sample()).top[0]).toBeGreaterThan(200);
  expect((await sample()).bottom[2]).toBeGreaterThan(200);
  expect((await sample()).gpuError).toBe(0);
  await expect(page.locator('video')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await sample()).top[0]).toBeGreaterThan(200);

  await page.evaluate(() => {
    const gl = document.querySelector('canvas')!.getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 200);
  });
  await expect.poll(async () => (await sample()).bottom[2]).toBeGreaterThan(200);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove video' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(exceptions).toEqual([]);
});
