import { ConfigService } from '@nestjs/config';
import { EzariaClient } from './ezaria.client';

function buildClient(botToken: string, timeoutMs = 5000): EzariaClient {
  const config = {
    get: (key: string) =>
      key === 'app.ezaria'
        ? { botToken, baseUrl: 'https://aria.example.com/v1/bot/send', timeoutMs }
        : undefined,
  } as unknown as ConfigService;
  return new EzariaClient(config);
}

describe('EzariaClient', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('토큰이 없으면 isConfigured가 false이고 발송하지 않는다', async () => {
    const client = buildClient('');
    expect(client.isConfigured).toBe(false);
    await expect(client.send('room-1', 'hi')).rejects.toThrow('ezaria_not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('토큰을 URL 경로에 붙여 chatRoomId/content를 POST한다', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    const client = buildClient('secret-token');

    await client.send('room-1', '내용');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://aria.example.com/v1/bot/send/secret-token');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ chatRoomId: 'room-1', content: '내용' });
    expect(init.signal).toBeDefined();
  });

  it('비-2xx 응답이면 상태코드를 담아 예외를 던진다', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => 'room not found' });
    const client = buildClient('secret-token');

    await expect(client.send('bad-room', '내용')).rejects.toThrow(
      /ezaria_send_failed status=404 room not found/,
    );
  });

  it('네트워크 오류는 그대로 전파한다', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    const client = buildClient('secret-token');

    await expect(client.send('room-1', '내용')).rejects.toThrow('timeout');
  });

  it('로그에 봇 토큰을 남기지 않는다', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    const client = buildClient('secret-token');
    const logs: string[] = [];
    jest
      .spyOn(client['logger'], 'log')
      .mockImplementation((message: unknown) => logs.push(String(message)));

    await client.send('room-1', '내용');

    expect(logs.join('\n')).not.toContain('secret-token');
    expect(logs.join('\n')).toContain('room-1');
  });
});
