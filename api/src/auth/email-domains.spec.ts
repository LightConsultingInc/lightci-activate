import { emailDomain, parseEmailDomains } from './email-domains';

describe('email domains (T1.1)', () => {
  it('normalises lists from strings or arrays and drops junk', () => {
    expect(parseEmailDomains('Acme.com, @ops.acme.com acme.com')).toEqual([
      'acme.com',
      'ops.acme.com',
    ]);
    expect(parseEmailDomains(['Example.ORG', 'not a domain', ''])).toEqual([
      'example.org',
    ]);
    expect(parseEmailDomains(undefined)).toEqual([]);
    expect(parseEmailDomains('localhost')).toEqual([]);
  });

  it('extracts the domain of an address', () => {
    expect(emailDomain(' Jane.Doe@Example.com ')).toBe('example.com');
    expect(emailDomain('nope')).toBe('');
  });
});
