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
      context.fillStyle = '#000000'; context.fillRect(0, 0, 80, 180);
      context.fillStyle = '#ffffff';
      for (let x = 0; x < 80; x += 6) context.fillRect(x, 0, 3, 180);
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
      const top = new Uint8Array(64 * 24 * 4), bottom = new Uint8Array(64 * 24 * 4);
      gl.readPixels(Math.floor(canvas.width / 2) - 32, Math.floor(canvas.height * .6), 64, 24, gl.RGBA, gl.UNSIGNED_BYTE, top);
      gl.readPixels(Math.floor(canvas.width / 2) - 32, Math.floor(canvas.height * .4) - 24, 64, 24, gl.RGBA, gl.UNSIGNED_BYTE, bottom);
      const stats = (pixels: Uint8Array, channel: number) => {
        let peak = 0, dark = 0, lit = 0;
        for (let i = channel; i < pixels.length; i += 4) {
          peak = Math.max(peak, pixels[i]);
          if (pixels[i] < 5) dark++;
          if (pixels[i] > 25) lit++;
        }
        return { peak, dark, lit };
      };
      const fullFrame = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, fullFrame);
      let fingerprint = 0;
      for (const value of fullFrame) fingerprint = (Math.imul(fingerprint, 31) + value) | 0;
      return { top: stats(top, 0), bottom: stats(bottom, 2), fingerprint, gpuError: gl.getError() };
    });
  }
  await expect.poll(async () => (await sample()).top.peak).toBeGreaterThan(100);
  expect((await sample()).bottom.peak).toBeGreaterThan(100);
  expect((await sample()).top.dark).toBeGreaterThan(100);
  expect((await sample()).top.lit).toBeGreaterThan(5);
  const shapeFrame = (await sample()).fingerprint;
  const sourceBefore = await page.locator('video').getAttribute('src');
  await page.getByLabel('Character matching').selectOption('luminance');
  expect((await sample()).top.dark).toBeGreaterThan(100);
  expect((await sample()).fingerprint).not.toBe(shapeFrame);
  expect(await page.locator('video').getAttribute('src')).toBe(sourceBefore);
  await page.getByLabel('Character matching').selectOption('shape');
  expect((await sample()).fingerprint).toBe(shapeFrame);
  const slider = async (name: string, value: string) => {
    await page.getByRole('slider', { name, exact: true }).fill(value);
  };
  const maxResolution = async () => (await page.getByRole('slider', { name: 'Resolution (columns)', exact: true }).getAttribute('max'))!;
  await slider('Resolution (columns)', await maxResolution());
  const readableColumns = async () => page.locator('canvas').evaluate((canvas) => {
    const video = document.querySelector('video')!;
    const rect = canvas.getBoundingClientRect();
    const visibleWidth = Math.min(rect.width, rect.height * video.videoWidth / video.videoHeight);
    const columns = Number((canvas as HTMLCanvasElement).dataset.grid!.split(' × ')[0]);
    return { columns, cellWidth: visibleWidth / columns };
  });
  expect((await readableColumns()).cellWidth).toBeGreaterThanOrEqual(8);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await readableColumns()).cellWidth).toBeGreaterThanOrEqual(8);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Reset settings' }).click();
  const baseline = (await sample()).fingerprint;
  for (const [name, value] of [['Brightness', '0.5'], ['Contrast', '0.5'], ['Gamma', '2']]) {
    await slider(name, value);
    expect((await sample()).fingerprint).not.toBe(baseline);
    await page.getByRole('button', { name: 'Reset settings' }).click();
  }
  await slider('Opacity', '0.4');
  await expect(page.locator('canvas')).toHaveCSS('opacity', '0.4');
  await page.getByLabel('Color mode').selectOption('monochrome');
  await page.getByLabel('Foreground color').fill('#00ff00');
  expect((await sample()).top.peak).toBeLessThan(5);
  await page.getByLabel('Background color').fill('#ff0000');
  expect((await sample()).top.peak).toBeGreaterThan(200);
  await page.getByRole('button', { name: 'Reset settings' }).click();
  await page.getByLabel('Character preset').selectOption('Binary');
  expect((await sample()).fingerprint).not.toBe(baseline);
  await page.getByLabel('Custom characters').fill(' .@');
  await page.getByRole('button', { name: 'Apply characters' }).click();
  expect((await sample()).gpuError).toBe(0);
  await page.getByRole('button', { name: 'Reset settings' }).click();
  expect((await sample()).fingerprint).toBe(baseline);
  expect(await page.locator('video').getAttribute('src')).toBe(sourceBefore);
  expect((await sample()).gpuError).toBe(0);
  await expect(page.locator('video')).toBeHidden();
  const inlineWidth = await page.locator('canvas').evaluate((canvas) => canvas.getBoundingClientRect().width);
  await slider('Resolution (columns)', await maxResolution());
  const gridBeforeFullscreen = (await readableColumns()).columns;
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.className)).toBe('preview-stage');
  await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
  await expect.poll(() => page.locator('canvas').evaluate((canvas) => canvas.getBoundingClientRect().width)).toBeGreaterThan(inlineWidth);
  await expect.poll(async () => (await readableColumns()).columns).toBeGreaterThan(gridBeforeFullscreen);
  expect((await readableColumns()).cellWidth).toBeGreaterThanOrEqual(8);
  await expect.poll(async () => (await readableColumns()).columns).toBe(Number(await maxResolution()));
  expect(await page.locator('video').getAttribute('src')).toBe(sourceBefore);
  expect((await sample()).gpuError).toBe(0);
  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(page.getByRole('button', { name: 'Fullscreen', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await sample()).top.peak).toBeGreaterThan(100);

  await page.evaluate(() => {
    const gl = document.querySelector('canvas')!.getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 200);
  });
  await expect.poll(async () => (await sample()).bottom.peak).toBeGreaterThan(100);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await sample()).gpuError).toBe(0);
  await page.getByRole('button', { name: 'Remove video' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.route((url) => url.pathname === '/integration-fixture.webm', (route) => route.fulfill({ contentType: 'video/webm', body: Buffer.from(bytes) }));
  await page.goto('/examples/portfolio.html?src=/integration-fixture.webm');
  await expect(page.getByRole('img', { name: 'WebGL Portfolio background' })).toBeVisible();
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0);
  await expect.poll(async () => (await sample()).top.peak).toBeGreaterThan(100);
  await expect(page.getByRole('button')).toHaveCount(0);
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.loop && video.muted)).toBe(true);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(exceptions).toEqual([]);
});
