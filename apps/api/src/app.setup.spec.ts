import { parseTrustedProxyHops } from './app.setup';

describe('parseTrustedProxyHops', () => {
  it('defaults to zero trusted hops', () => {
    expect(parseTrustedProxyHops({})).toBe(0);
  });

  it.each([
    ['0', 0],
    ['1', 1],
    ['12', 12],
  ])('accepts an exact non-negative hop count (%s)', (configured, expected) => {
    expect(parseTrustedProxyHops({ TRUSTED_PROXY_HOPS: configured })).toBe(
      expected,
    );
  });

  it.each(['-1', '1.5', 'one', ' 1'])(
    'rejects invalid hop count %p',
    (value) => {
      expect(() =>
        parseTrustedProxyHops({ TRUSTED_PROXY_HOPS: value }),
      ).toThrow('TRUSTED_PROXY_HOPS');
    },
  );
});
