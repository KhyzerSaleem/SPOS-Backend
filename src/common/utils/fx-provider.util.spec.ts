import { fetchBaseRates } from './fx-provider.util';

describe('fetchBaseRates', () => {
  const realFetch = (globalThis as any).fetch;
  afterEach(() => {
    (globalThis as any).fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('returns the rates map on a successful response', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'success', base_code: 'USD', rates: { PKR: 278.5, SAR: 3.75 } }),
    });
    expect(await fetchBaseRates('usd')).toEqual({ PKR: 278.5, SAR: 3.75 });
  });

  it('returns null on a non-OK HTTP response', async () => {
    (globalThis as any).fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    expect(await fetchBaseRates('USD')).toBeNull();
  });

  it('returns null on a provider error payload', async () => {
    (globalThis as any).fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ result: 'error' }) });
    expect(await fetchBaseRates('USD')).toBeNull();
  });

  it('rejects an invalid base currency without calling the provider', async () => {
    const spy = jest.fn();
    (globalThis as any).fetch = spy;
    expect(await fetchBaseRates('US')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns null when the request throws', async () => {
    (globalThis as any).fetch = jest.fn().mockRejectedValue(new Error('network down'));
    expect(await fetchBaseRates('USD')).toBeNull();
  });
});
