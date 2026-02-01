import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Hash } from 'lucide-react';
import VariableSelector from './VariableSelector';
import api from '../../../../services/api';

export default function TextInputWithVariables({ 
  value = '', 
  onChange, 
  placeholder,
  maxLength,
  multiline = false,
  rows = 3,
  className = '',
  dir = 'rtl',
  noEmoji = false,
  label,
  compact = false,
}) {
  const [showVariables, setShowVariables] = useState(false);
  const [selectorPosition, setSelectorPosition] = useState({ top: 0, left: 0 });
  const [variableLabels, setVariableLabels] = useState({});
  const editorRef = useRef(null);
  const lastSelectionRef = useRef(null);

  const charCount = value?.length || 0;
  const isOverLimit = maxLength && charCount > maxLength;
  const isNearLimit = maxLength && charCount > maxLength * 0.9;
  const hasEmoji = noEmoji && /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(value || '');

  // Load variable labels
  useEffect(() => {
    loadVariableLabels();
  }, []);

  const loadVariableLabels = async () => {
    try {
      const res = await api.get('/variables');
      const labels = {};
      (res.data.systemVariables || []).forEach(v => { labels[v.name] = v.label; });
      (res.data.userVariables || []).forEach(v => { labels[v.name] = v.label || v.name; });
      (res.data.customSystemVariables || []).forEach(v => { labels[v.name] = v.label || v.name; });
      setVariableLabels(labels);
    } catch (err) {
      console.error('Failed to load variable labels:', err);
    }
  };

  // Convert text to HTML with badges
  const textToHtml = useCallback((text) => {
    if (!text) return '';
    
    // Escape HTML and convert variables to badges
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    return escaped.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const label = variableLabels[varName] || varName;
      return `<span class="var-badge" contenteditable="false" data-var="${varName}">${label}</span>`;
    }).replace(/\n/g, '<br>');
  }, [variableLabels]);

  // Convert HTML back to text
  const htmlToText = (element) => {
    let result = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList?.contains('var-badge')) {
          result += `{{${node.getAttribute('data-var')}}}`;
        } else if (node.tagName === 'BR') {
          result += '\n';
        } else if (node.tagName === 'DIV' || node.tagName === 'P') {
          if (result && !result.endsWith('\n')) result += '\n';
          result += htmlToText(node);
        } else {
          result += htmlToText(node);
        }
      }
    }
    return result;
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    const newText = htmlToText(editorRef.current);
    onChange(newText);
  };

  const handleKeyDown = (e) => {
    // Open selector on {
    if (e.key === '{' && e.shiftKey) {
      e.preventDefault();
      openSelector();
      return;
    }

    // Delete whole badge on backspace
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (range.collapsed) {
          // Check prev sibling
          let prev = range.startContainer.previousSibling;
          if (!prev && range.startOffset === 0) {
            prev = range.startContainer.parentNode?.previousSibling;
          }
          if (prev?.classList?.contains('var-badge')) {
            e.preventDefault();
            prev.remove();
            handleInput();
            return;
          }
        }
      }
    }

    // Delete whole badge on delete
    if (e.key === 'Delete') {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (range.collapsed) {
          const next = range.startContainer.nextSibling;
          if (next?.classList?.contains('var-badge')) {
            e.preventDefault();
            next.remove();
            handleInput();
            return;
          }
        }
      }
    }

    // Prevent enter in single line
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
    }
  };

  const openSelector = () => {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      lastSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
    const rect = editorRef.current?.getBoundingClientRect();
    if (rect) {
      setSelectorPosition({
        top: rect.bottom + 5,
        left: Math.min(rect.left, window.innerWidth - 300),
      });
    }
    setShowVariables(true);
  };

  const handleSelectVariable = (variable) => {
    const varName = variable.replace(/^\{\{|\}\}$/g, '');
    const label = variableLabels[varName] || varName;
    
    const badge = document.createElement('span');
    badge.className = 'var-badge';
    badge.contentEditable = 'false';
    badge.setAttribute('data-var', varName);
    badge.textContent = label;
    
    if (lastSelectionRef.current && editorRef.current.contains(lastSelectionRef.current.startContainer)) {
      const range = lastSelectionRef.current;
      range.deleteContents();
      range.insertNode(badge);
      range.setStartAfter(badge);
      range.setEndAfter(badge);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editorRef.current.appendChild(badge);
    }
    
    const space = document.createTextNode(' ');
    badge.after(space);
    
    setShowVariables(false);
    handleInput();
    editorRef.current.focus();
  };

  // Sync when value changes externally
  useEffect(() => {
    if (editorRef.current) {
      const currentText = htmlToText(editorRef.current);
      if (currentText !== value) {
        editorRef.current.innerHTML = textToHtml(value);
      }
    }
  }, [value, textToHtml]);

  // Re-render when labels load
  useEffect(() => {
    if (editorRef.current && value && Object.keys(variableLabels).length > 0) {
      editorRef.current.innerHTML = textToHtml(value);
    }
  }, [variableLabels]);

  const editorStyle = useMemo(() => ({
    minHeight: multiline ? `${rows * 1.5}em` : '2.5em',
    maxHeight: multiline ? '200px' : '2.5em',
    overflowY: multiline ? 'auto' : 'hidden',
    whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
    lineHeight: '1.8',
  }), [multiline, rows]);

  return (
    <div className="relative">
      <style>{`
        .var-badge {
          display: inline-flex;
          align-items: center;
          background: linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%);
          color: #3b82f6;
          font-size: 0.85em;
          font-weight: 500;
          padding: 1px 8px;
          border-radius: 10px;
          margin: 0 2px;
          user-select: all;
          cursor: default;
          border: 1px solid #93c5fd;
          white-space: nowrap;
        }
        .var-badge:hover {
          background: linear-gradient(135deg, #bfdbfe 0%, #c7d2fe 100%);
        }
        .var-badge::before {
          content: '#';
          margin-left: 3px;
          opacity: 0.5;
          font-size: 0.9em;
        }
        .var-editor:empty::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        .var-editor:focus { outline: none; }
      `}</style>
      
      {label && (
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-500">{label}</span>
          {maxLength && (
            <span className={`${isOverLimit ? 'text-red-500' : isNearLimit ? 'text-orange-500' : 'text-gray-400'}`}>
              {charCount}/{maxLength}
            </span>
          )}
        </div>
      )}
      
      <div
        ref={editorRef}
        contentEditable
        className={`var-editor w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 transition-colors ${
          isOverLimit || hasEmoji
            ? 'border-red-300 focus:ring-red-200 focus:border-red-400' 
            : 'border-gray-200 focus:ring-teal-200 focus:border-teal-400'
        } ${className}`}
        style={editorStyle}
        dir={dir}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
      
      {!compact && (
        <div className="flex items-center justify-between mt-1">
          <button
            type="button"
            onClick={openSelector}
            className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
          >
            <Hash className="w-3 h-3" />
            הוסף משתנה
          </button>
          {hasEmoji && <span className="text-xs text-red-500">⚠️ ללא אימוג'י</span>}
        </div>
      )}

      <VariableSelector
        isOpen={showVariables}
        onSelect={handleSelectVariable}
        onClose={() => setShowVariables(false)}
        position={selectorPosition}
      />
    </div>
  );
}
