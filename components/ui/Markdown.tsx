// Texto Markdown de la IA convertido a HTML y SANEADO con DOMPurify antes de
// pintarlo: la respuesta del modelo no es de fiar como HTML.
import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

export const markdownAHtml = (texto: string): string => {
  const html = marked.parse(texto ?? '', { async: false }) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'img', 'iframe', 'form', 'input'] });
};

const Markdown: React.FC<{ texto: string; className?: string }> = ({ texto, className = '' }) => {
  const html = useMemo(() => markdownAHtml(texto), [texto]);
  return (
    <div
      className={`markdown-ia text-sm leading-relaxed break-words ${className}`}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default Markdown;
