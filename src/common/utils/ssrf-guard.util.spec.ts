import { assertPublicHttpUrl } from './ssrf-guard.util';
import * as dns from 'dns/promises';

jest.mock('dns/promises');
const mockedLookup = dns.lookup as jest.MockedFunction<typeof dns.lookup>;

describe('assertPublicHttpUrl', () => {
  afterEach(() => jest.resetAllMocks());

  it('allows a normal public https URL', async () => {
    mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);
    await expect(assertPublicHttpUrl('https://example.com/webhook')).resolves.toBeUndefined();
  });

  it('rejects a non-http(s) scheme', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow(/http or https/);
    await expect(assertPublicHttpUrl('gopher://internal/1')).rejects.toThrow(/http or https/);
  });

  it('rejects a malformed URL', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toThrow(/Invalid URL/);
  });

  it('rejects "localhost" outright without a DNS lookup', async () => {
    await expect(assertPublicHttpUrl('http://localhost:5000/hook')).rejects.toThrow(
      /local\/internal/,
    );
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('rejects the AWS/GCP/Azure cloud metadata address given as a literal IP', async () => {
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /private or reserved/,
    );
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it.each([
    ['10.0.0.5', '10.0.0.0/8'],
    ['172.16.5.1', '172.16.0.0/12'],
    ['192.168.1.1', '192.168.0.0/16'],
    ['127.0.0.1', 'loopback'],
    ['169.254.169.254', 'link-local/cloud metadata'],
  ])('rejects a literal private IPv4 address %s (%s)', async (ip) => {
    await expect(assertPublicHttpUrl(`http://${ip}/hook`)).rejects.toThrow(/private or reserved/);
  });

  it('rejects when the hostname resolves to a private IP (DNS rebinding scenario)', async () => {
    // A domain that would have passed a one-time check at creation, but whose
    // DNS record was later re-pointed at an internal address.
    mockedLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as any);
    await expect(assertPublicHttpUrl('https://rebind-me.example.com/hook')).rejects.toThrow(
      /private or reserved/,
    );
  });

  it('rejects when DNS resolution fails', async () => {
    mockedLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertPublicHttpUrl('https://does-not-exist.invalid/hook')).rejects.toThrow(
      /Could not resolve/,
    );
  });

  it('rejects an IPv6 loopback/link-local literal', async () => {
    await expect(assertPublicHttpUrl('http://[::1]/hook')).rejects.toThrow(/private or reserved/);
  });
});
