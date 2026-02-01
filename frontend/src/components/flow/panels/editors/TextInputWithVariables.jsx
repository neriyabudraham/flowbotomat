import { useState, useRef, useEffect } from 'react';
import { Variable } from 'lucide-react';
import VariableSelector from './VariableSelector';
import api from '../../../../services/api';

/**
 * Text input with variable support
 * Shows variables as styled badges in a visual preview
 * Uses regular textarea for actual editing
 */
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
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectorPosition, setSelectorPosition] = useState({ top: 0, left: 0 });
  const [variableLabels, setVariableLabels] = useState({});
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

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

  // Listen for { key
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (document.activeElement !== inputRef.current) return;
      
      if (e.key === '{' && e.shiftKey) {
        e.preventDefault();
        openSelector();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [value]);

  const openSelector = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect) {
      setSelectorPosition({
        top: rect.bottom + 5,
        left: Math.min(rect.left, window.innerWidth - 300),
      });
    }
    setCursorPosition(inputRef.current?.selectionStart || (value?.length || 0));
    setShowVariables(true);
  };

  const handleSelectVariable = (variable) => {
    const before = (value || '').slice(0, cursorPosition);
    const after = (value || '').slice(cursorPosition);
    const newValue = before + variable + after;
    
    // Update variable labels cache with the new variable
    const varName = variable.replace(/^\{\{|\}\}$/g, '');
    if (!variableLabels[varName]) {
      loadVariableLabels(); // Reload to get the new label
    }
    
    onChange(newValue);
    setShowVariables(false);
    
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newPos = cursorPosition + variable.length;
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 50);
  };

  // Render text with variable badges for preview (styled like mentions)
  const renderPreview = () => {
    if (!value) return null;
    
    const parts = [];
    let lastIndex = 0;
    const regex = /\{\{([^}]+)\}\}/g;
    let match;
    
    while ((match = regex.exec(value)) !== null) {
      // Add text before the variable
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {value.slice(lastIndex, match.index)}
          </span>
        );
      }
      
      // Add the variable badge - styled like mentions
      const varName = match[1];
      const label = variableLabels[varName] || varName;
      parts.push(
        <span
          key={`var-${match.index}`}
          className="inline-flex items-center text-indigo-700 text-xs font-medium px-2 py-0.5 rounded-full mx-0.5 whitespace-nowrap"
          style={{ 
            background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
            border: '1px solid #a5b4fc'
          }}
        >
          @{label}
        </span>
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < value.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {value.slice(lastIndex)}
        </span>
      );
    }
    
    return parts;
  };

  const InputComponent = multiline ? 'textarea' : 'input';
  const hasVariables = value && value.includes('{{');

  return (
    <div className="relative">
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
      
      {/* Preview with badges - shown when has variables and not focused */}
      {hasVariables && !isFocused && (
        <div
          onClick={() => inputRef.current?.focus()}
          className={`w-full px-3 py-2 bg-white border rounded-lg text-sm cursor-text whitespace-pre-wrap ${
            isOverLimit || hasEmoji
              ? 'border-red-300' 
              : 'border-gray-200'
          } ${multiline ? '' : 'truncate'} ${className}`}
          style={{ 
            minHeight: multiline ? `${rows * 1.5}em` : 'auto',
            lineHeight: '1.8'
          }}
          dir={dir}
        >
          {renderPreview()}
        </div>
      )}
      
      {/* Actual input - shown when focused or no variables */}
      <InputComponent
        ref={inputRef}
        type={multiline ? undefined : 'text'}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 100)}
        placeholder={placeholder}
        rows={multiline ? rows : undefined}
        dir={dir}
        className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 outline-none transition-colors ${
          isOverLimit || hasEmoji
            ? 'border-red-300 focus:ring-red-200 focus:border-red-400' 
            : 'border-gray-200 focus:ring-teal-200 focus:border-teal-400'
        } ${multiline ? 'resize-none' : ''} ${className} ${hasVariables && !isFocused ? 'absolute opacity-0 pointer-events-none' : ''}`}
        style={hasVariables && !isFocused ? { position: 'absolute', opacity: 0 } : {}}
      />
      
      {!compact && (
        <div className="flex items-center justify-between mt-1">
          <button
            type="button"
            onClick={openSelector}
            className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <Variable className="w-3 h-3" />
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
