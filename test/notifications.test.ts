import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationService } from '../src/notifications/service.js';

const fetchMock = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function response(status = 200, body = ''): Response {
  return new Response(body, { status });
}

describe('NotificationService', () => {
  it('sends Pushover notifications and requires provider-level success', async () => {
    vi.stubGlobal('fetch', fetchMock.mockResolvedValue(response(200, JSON.stringify({ status: 1 }))));

    const notification = {
      provider: 'pushover' as const,
      pushover: { token: 'token', user: 'user', device: 'device' },
    };
    await expect(NotificationService.send({ notification, title: 'Title', message: 'Message' })).resolves.toEqual({ sent: true, provider: 'Pushover', status: 200 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.pushover.net/1/messages.json');
    expect(options.method).toBe('POST');
    expect(options.body).toContain('token=token');
    expect(options.body).toContain('user=user');
    expect(options.body).toContain('device=device');
    expect(options.body).toContain('sound=pushover');
  });

  it('rejects a Pushover API failure even when HTTP succeeds', async () => {
    vi.stubGlobal('fetch', fetchMock.mockResolvedValue(response(200, JSON.stringify({ status: 0, errors: ['invalid token'] }))));
    const notification = { provider: 'pushover' as const, pushover: { token: 'bad', user: 'user' } };
    await expect(NotificationService.send({ notification, title: 'Title', message: 'Message' })).rejects.toThrow('Pushover returned invalid token');
  });

  it('rejects multiple Pushbullet targets', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const notification = {
      provider: 'pushbullet' as const,
      pushbullet: { apiKey: 'key', deviceIden: 'device', email: 'user@example.com' },
    };
    await expect(NotificationService.send({ notification, title: 'Title', message: 'Message' })).rejects.toThrow('Specify only one Pushbullet target');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends Pushbullet notifications to a channel when configured', async () => {
    vi.stubGlobal('fetch', fetchMock.mockResolvedValue(response()));
    const notification = { provider: 'pushbullet' as const, pushbullet: { apiKey: 'key', channelTag: 'alerts' } };
    await expect(NotificationService.send({ notification, title: 'Title', message: 'Message' })).resolves.toEqual({ sent: true, provider: 'Pushbullet', status: 200 });
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ type: 'note', title: 'Title', body: 'Message', channel_tag: 'alerts' });
  });

  it('uses the ntfy default server and preserves notification options', async () => {
    vi.stubGlobal('fetch', fetchMock.mockResolvedValue(response()));
    const notification = {
      provider: 'ntfy' as const,
      ntfy: { topic: 'camera alerts', accessToken: 'token', tags: 'camera,warning', priority: 5 },
    };
    await expect(NotificationService.send({ notification, title: 'Title', message: 'Message' })).resolves.toEqual({ sent: true, provider: 'ntfy', status: 200 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe('https://ntfy.sh/camera%20alerts');
    expect(options.headers).toMatchObject({ Title: 'Title', Priority: '5', Tags: 'camera,warning', Authorization: 'Bearer token' });
    expect(options.body).toBe('Message');
  });

  it('validates Pushcut HTTPS URLs', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const notification = { provider: 'pushcut' as const, pushcut: { pushcutUrl: 'http://example.test/hook' } };
    await expect(NotificationService.send({ notification, title: 'Title', message: 'Message' })).rejects.toThrow('Pushcut Webhook URL must use HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends Pushcut JSON using the shared message', async () => {
    vi.stubGlobal('fetch', fetchMock.mockResolvedValue(response()));
    const notification = { provider: 'pushcut' as const, pushcut: { pushcutUrl: 'https://example.test/hook' } };
    await expect(NotificationService.send({ notification, title: 'Title', message: 'Message' })).resolves.toEqual({ sent: true, provider: 'Pushcut', status: 200 });
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ title: 'Title', text: 'Message' });
  });

  it('sends Push Safer sound and optional fields from the same provider implementation', async () => {
    vi.stubGlobal('fetch', fetchMock.mockResolvedValue(response()));
    const notification = {
      provider: 'pushsafer' as const,
      pushsafer: {
        privateKey: 'key', pushsaferDevice: '2', icon: 3, vibration: 4, priority: 5,
        iconColor: '#fff', url: 'https://example.test', urlTitle: 'Open', timeToLive: 60, retry: 2, expire: 30,
      },
    };
    await expect(NotificationService.send({ notification, title: 'Title', message: 'Message', sound: '7' })).resolves.toEqual({ sent: true, provider: 'Push Safer', status: 200 });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toContain('k=key');
    expect(options.body).toContain('s=7');
    expect(options.body).toContain('i=3');
    expect(options.body).toContain('v=4');
    expect(options.body).toContain('p=5');
    expect(options.body).toContain('l=60');
    expect(options.body).toContain('re=2');
    expect(options.body).toContain('ex=30');
  });
});
