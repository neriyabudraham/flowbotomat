import { useState, useRef, useEffect } from 'react';
import VariableSelector from './VariableSelector';

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
  compact = false, // Hide the "add variable" button - just use { to trigger
}) {
  const [showVariables, setShowVariables] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectorPosition, setSelectorPosition] = useState({ top: 0, left: 0 });
  const inputRef = useRef(null);

  const charCount = value?.length || 0;
  const isOverLimit = maxLength && charCount > maxLength;
  const isNearLimit = maxLength && charCount > maxLength * 0.9;
  const hasEmoji = noEmoji && /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(value || '');

  // Get caret position in pixels (for positioning popup near cursor)
  const getCaretPosition = () => {
    const input = inputRef.current;
    if (!input) return null;
    
    const rect = input.getBoundingClientRect();
    // For textarea, try to estimate position based on cursor
    const cursorPos = input.selectionStart || 0;
    const textBeforeCursor = (value || '').slice(0, cursorPos);
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines.length - 1;
    const lineHeight = 24; // Approximate line height
    
    // Calculate approximate position
    const top = rect.top + Math.min(currentLine * lineHeight, rect.height - 20) + lineHeight + 5;
    const left = Math.max(rect.left, Math.min(rect.right - 300, window.innerWidth - 320));
    
    return { top, left };
  };

  // Listen for { key - only when Shift is pressed (actual { character)
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (document.activeElement !== inputRef.current) return;
      
      // Only trigger on actual { character (Shift + [ or Shift + ה in Hebrew)
      if (e.key === '{' && e.shiftKey) {
        e.preventDefault();
        const pos = getCaretPosition();
        if (pos) {
          setSelectorPosition(pos);
        }
        setCursorPosition(inputRef.current?.selectionStart || 0);
        setShowVariables(true);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [value]);

  const handleSelectVariable = (variable) => {
    const before = (value || '').slice(0, cursorPosition);
    const after = (value || '').slice(cursorPosition);
    const newValue = before + variable + after;
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

  const InputComponent = multiline ? 'textarea' : 'input';

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
      
      <InputComponent
        ref={inputRef}
        type={multiline ? undefined : 'text'}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? rows : undefined}
        dir={dir}
        className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 outline-none transition-colors ${
          isOverLimit || hasEmoji
            ? 'border-red-300 focus:ring-red-200 focus:border-red-400' 
            : 'border-gray-200 focus:ring-teal-200 focus:border-teal-400'
        } ${multiline ? 'resize-none' : ''} ${className}`}
      />
      
      {/* Status bar - hidden in compact mode */}
      {!compact && (
        <div className="flex items-center justify-between mt-1">
          <button
            type="button"
            onClick={(e) => {
              const buttonRect = e.currentTarget.getBoundingClientRect();
              setSelectorPosition({ 
                top: buttonRect.bottom + 5, 
                left: Math.max(buttonRect.left - 100, 10) 
              });
              setCursorPosition(inputRef.current?.selectionStart || (value?.length || 0));
              setShowVariables(true);
            }}
            className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
          >
            <span className="bg-teal-100 px-1.5 py-0.5 rounded">{'{ }'}</span>
            הוסף משתנה
          </button>
          
          {hasEmoji && <span className="text-xs text-red-500">⚠️ ללא אימוג'י</span>}
        </div>
      )}

      {/* Variable Selector */}
      <VariableSelector
        isOpen={showVariables}
        onSelect={handleSelectVariable}
        onClose={() => setShowVariables(false)}
        position={selectorPosition}
      />
    </div>
  );
}
