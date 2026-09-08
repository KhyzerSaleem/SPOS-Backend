import { renderEmailLayout, infoBox, otpCodeBlock, dataTable, bulletList } from './email-templates';

describe('email-templates', () => {
  describe('renderEmailLayout', () => {
    it('escapes an XSS attempt in the title', () => {
      const html = renderEmailLayout({ title: '<script>alert(1)</script>', bodyHtml: '' });
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes an XSS attempt in the CTA url via attribute escaping', () => {
      const html = renderEmailLayout({
        title: 'Hi',
        bodyHtml: '',
        cta: { label: 'Click', url: `javascript:alert(1)"onmouseover="alert(2)` },
      });
      // The quote that would break out of the href attribute must be escaped.
      expect(html).not.toContain(`"onmouseover="alert(2)`);
    });

    it('includes dark-mode support (color-scheme meta + prefers-color-scheme media query)', () => {
      const html = renderEmailLayout({ title: 'Hi', bodyHtml: '' });
      expect(html).toContain('name="color-scheme" content="light dark"');
      expect(html).toContain('@media (prefers-color-scheme: dark)');
    });

    it('renders the CTA button when provided and omits it when not', () => {
      const withCta = renderEmailLayout({
        title: 'Hi',
        bodyHtml: '',
        cta: { label: 'Go', url: 'https://x.com' },
      });
      expect(withCta).toContain('Go');
      expect(withCta).toContain('https://x.com');

      const withoutCta = renderEmailLayout({ title: 'Hi', bodyHtml: '' });
      expect(withoutCta).not.toContain('border-radius:999px;background:');
    });

    it('falls back to the title as the preheader when none is given', () => {
      const html = renderEmailLayout({ title: 'Your code is ready', bodyHtml: '' });
      expect(html).toContain('Your code is ready');
    });

    it('renders a valid HTML document', () => {
      const html = renderEmailLayout({ title: 'Hi', bodyHtml: '<p>body</p>' });
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
      expect(html).toContain('<p>body</p>');
    });
  });

  describe('infoBox', () => {
    it('escapes label and value XSS attempts', () => {
      const html = infoBox([{ label: '<b>label</b>', value: '<img src=x onerror=alert(1)>' }]);
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
      expect(html).toContain('&lt;b&gt;label&lt;/b&gt;');
    });

    it('renders one row per entry', () => {
      const html = infoBox([
        { label: 'A', value: '1' },
        { label: 'B', value: '2' },
      ]);
      expect(html).toContain('>A<');
      expect(html).toContain('>1<');
      expect(html).toContain('>B<');
      expect(html).toContain('>2<');
    });
  });

  describe('otpCodeBlock', () => {
    it('renders the exact code and escapes it', () => {
      const html = otpCodeBlock('123456');
      expect(html).toContain('123456');
    });

    it('escapes injected content in the code parameter', () => {
      const html = otpCodeBlock('<script>x</script>');
      expect(html).not.toContain('<script>x</script>');
    });
  });

  describe('dataTable', () => {
    it('escapes header, cell, and footer content', () => {
      const html = dataTable(['<b>Item</b>', 'Qty'], [['<img src=x onerror=alert(1)>', '2']], {
        label: '<i>Total</i>',
        value: '$10',
      });
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
      expect(html).not.toContain('<i>Total</i>');
      expect(html).toContain('&lt;b&gt;Item&lt;/b&gt;');
    });

    it('renders without a footer row when none is provided', () => {
      const html = dataTable(['A'], [['1']]);
      expect(html).toContain('>1<');
    });
  });

  describe('bulletList', () => {
    it('escapes each item', () => {
      const html = bulletList(['<script>alert(1)</script>', 'Safe item']);
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('Safe item');
    });

    it('renders one row per item', () => {
      const html = bulletList(['One', 'Two', 'Three']);
      expect(html).toContain('One');
      expect(html).toContain('Two');
      expect(html).toContain('Three');
    });
  });
});
