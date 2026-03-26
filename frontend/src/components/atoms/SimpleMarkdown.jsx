import { Link } from 'react-router-dom';

// Markdown renderer for legal pages and terms
// Supports: headers, lists, bold, italic, links, horizontal rules
function processInline(text) {
  const parts = [];
  // Match **bold**, [link text](url), and plain text
  const regex = /(\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // Bold
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3] && match[4]) {
      // Link
      const linkText = match[3];
      const url = match[4];
      if (url.startsWith('/')) {
        parts.push(<Link key={match.index} to={url} className="text-blue-600 hover:text-blue-800 underline">{linkText}</Link>);
      } else {
        parts.push(<a key={match.index} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">{linkText}</a>);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

export default function SimpleMarkdown({ content }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let inList = false;
  let listItems = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 my-4 text-gray-600">
          {listItems.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      flushList();
      return;
    }

    // Headers
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h1 key={index} className="text-2xl font-bold text-gray-900 mt-8 mb-4 first:mt-0">
          {processInline(trimmed.slice(2))}
        </h1>
      );
      return;
    }

    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={index} className="text-xl font-bold text-gray-800 mt-6 mb-3">
          {processInline(trimmed.slice(3))}
        </h2>
      );
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={index} className="text-lg font-semibold text-gray-800 mt-4 mb-2">
          {processInline(trimmed.slice(4))}
        </h3>
      );
      return;
    }

    // Horizontal rule
    if (trimmed === '---') {
      flushList();
      elements.push(<hr key={index} className="my-6 border-gray-200" />);
      return;
    }

    // List items (- item or 1.1. item)
    if (trimmed.startsWith('- ') || trimmed.match(/^\d+\.\d+\.?\s/)) {
      inList = true;
      const text = trimmed.replace(/^-\s*/, '').replace(/^\d+\.\d+\.?\s*/, '');
      listItems.push(<span key={index}>{processInline(text)}</span>);
      return;
    }

    // Italic text (wrapped in *)
    if (trimmed.startsWith('*') && trimmed.endsWith('*') && !trimmed.startsWith('**')) {
      flushList();
      elements.push(
        <p key={index} className="text-gray-500 italic my-4">
          {trimmed.slice(1, -1)}
        </p>
      );
      return;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={index} className="text-gray-600 my-3">
        {processInline(trimmed)}
      </p>
    );
  });

  flushList();

  return <div>{elements}</div>;
}
