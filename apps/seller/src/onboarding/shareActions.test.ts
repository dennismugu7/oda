import { describe, expect, it, vi } from 'vitest';
import { shareTo, type ShareDeps } from './shareActions';

function phone(installed: string[] = ['whatsapp://', 'snssdk1233://', 'https://']) {
  const deps: ShareDeps = {
    openUrl: vi.fn(async (url: string) => installed.some((prefix) => url.startsWith(prefix))),
    shareSheet: vi.fn(async () => true),
    copy: vi.fn(async () => {}),
  };
  return deps;
}

const POST = 'New drops! https://oda-eta.vercel.app/amani-styles?s=wa';

describe('share buttons on step 6 (owner Step 58)', () => {
  it('WhatsApp opens WhatsApp with the post filled in, not the share sheet', async () => {
    const deps = phone();
    expect(await shareTo('whatsapp', POST, deps)).toEqual({ shared: true, notice: null });
    expect(deps.openUrl).toHaveBeenCalledWith(`whatsapp://send?text=${encodeURIComponent(POST)}`);
    expect(deps.shareSheet).not.toHaveBeenCalled();
  });

  it('Status opens the same WhatsApp screen with a hint to pick My status', async () => {
    const deps = phone();
    expect(await shareTo('whatsapp_status', POST, deps)).toEqual({
      shared: true,
      notice: 'Choose "My status" at the top of the list.',
    });
  });

  it('without WhatsApp, both fall back to the share sheet and say why', async () => {
    const deps = phone(['https://']);
    const outcome = await shareTo('whatsapp', POST, deps);
    expect(deps.shareSheet).toHaveBeenCalledWith(POST);
    expect(outcome).toEqual({
      shared: true,
      notice: "WhatsApp isn't on this phone, so we opened the share menu instead.",
    });
  });

  it('TikTok: copies the caption, opens the app (or the website without it)', async () => {
    const deps = phone();
    expect(await shareTo('tiktok', POST, deps)).toEqual({
      shared: true,
      notice: 'Caption copied — paste it in your bio or post.',
    });
    expect(deps.copy).toHaveBeenCalledWith(POST);
    expect(deps.openUrl).toHaveBeenCalledWith('snssdk1233://');

    const noApp = phone(['https://']);
    await shareTo('tiktok', POST, noApp);
    expect(noApp.openUrl).toHaveBeenLastCalledWith('https://www.tiktok.com/');
  });

  it('says so when nothing opens, the caption still copied', async () => {
    const deps = phone([]);
    expect(await shareTo('instagram', POST, deps)).toEqual({
      shared: false,
      notice: "Caption copied, but Instagram didn't open. Paste it in Instagram yourself.",
    });
  });

  it('More opens the share sheet', async () => {
    const deps = phone();
    expect(await shareTo('more', POST, deps)).toEqual({ shared: true, notice: null });
    expect(deps.shareSheet).toHaveBeenCalledWith(POST);
  });
});
