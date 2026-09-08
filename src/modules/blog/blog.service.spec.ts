// sanitize-html pulls ESM-only deps that this repo's ts-jest doesn't transform.
// Its script-stripping is the library's job (verified live via the API); here we
// mock it to a passthrough / tag-stripper and test OUR logic: TOC building and
// heading-id injection.
jest.mock('sanitize-html', () => {
  const fn = (html: string, opts?: { allowedTags?: string[] }) => {
    if (opts && Array.isArray(opts.allowedTags) && opts.allowedTags.length === 0) {
      return String(html || '').replace(/<[^>]+>/g, ' ');
    }
    return String(html || '');
  };
  const simpleTransform = () => (tagName: string, attribs: Record<string, string>) => ({
    tagName,
    attribs,
  });
  return Object.assign(fn, { __esModule: true, default: fn, simpleTransform });
});

import { BlogService } from './blog.service';

function makeService() {
  return new BlogService({} as any);
}

describe('BlogService.prepareContent', () => {
  const svc = makeService();

  it('builds a table of contents from h2/h3 and injects ids', () => {
    const { content, toc } = svc.prepareContent(
      '<h2>Getting Started</h2><p>x</p><h3>Step One</h3><p>y</p><h3>Step Two</h3>',
    );
    expect(toc).toHaveLength(3);
    expect(toc[0]).toMatchObject({ text: 'Getting Started', level: 2 });
    expect(toc[1]).toMatchObject({ text: 'Step One', level: 3 });
    expect(toc[0].id).toMatch(/^getting-started/);
    expect(content).toContain(`id="${toc[0].id}"`);
    expect(content).toContain(`id="${toc[2].id}"`);
  });

  it('gives each heading a unique id even when text repeats', () => {
    const { toc } = svc.prepareContent('<h2>Notes</h2><h2>Notes</h2>');
    expect(toc).toHaveLength(2);
    expect(toc[0].id).not.toEqual(toc[1].id);
  });

  it('ignores empty headings and strips inner tags for the TOC label', () => {
    const { toc } = svc.prepareContent('<h2><strong>Bold Heading</strong></h2><h2></h2>');
    expect(toc).toHaveLength(1);
    expect(toc[0].text).toBe('Bold Heading');
  });
});
