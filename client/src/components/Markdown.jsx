import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
  table: ({ node, ...props }) => <div className="md-table"><table {...props} /></div>,
  pre: ({ node, ...props }) => <pre className="md-pre" {...props} />,
};

/** Renders AI output. Raw HTML is never rendered (react-markdown default). */
export const Markdown = memo(function Markdown({ text }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>;
});
