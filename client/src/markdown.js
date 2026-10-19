import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Only allow video embeds from trusted hosts
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'IFRAME' && !/^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\/|^https:\/\/player\.vimeo\.com\//.test(node.getAttribute('src') || '')) node.remove();
  if (node.tagName === 'A') { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
  if (node.tagName === 'IMG') node.setAttribute('loading', 'lazy');
});

const slug = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

/** Markdown -> sanitized HTML (XSS-safe) + a table of contents built from h2/h3 headings. */
export function renderMarkdown(md = '') {
  const dirty = marked.parse(md, { gfm: true, breaks: false });
  const clean = DOMPurify.sanitize(dirty, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder'] });
  const doc = new DOMParser().parseFromString(`<div>${clean}</div>`, 'text/html');
  const toc = [];
  doc.querySelectorAll('h2,h3').forEach((h, i) => {
    h.id = `${slug(h.textContent)}-${i}`;
    toc.push({ id: h.id, text: h.textContent, level: Number(h.tagName[1]) });
  });
  return { html: doc.body.firstChild.innerHTML, toc };
}
