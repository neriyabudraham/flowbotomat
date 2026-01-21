import { useState, useRef } from 'react';
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
}) {
  const [showVariables, setShowVariables] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectorPosition, setSelectorPosition] = useState({ top: 0, left: 0 });
  const inputRef = useRef(null);

  const charCount = value?.length || 0;
  const isOverLimit = maxLength && charCount > maxLength;
  const isNearLimit = maxLength && charCount > maxLength * 0.9;
  
  // Check for emoji if noEmoji is true
  const hasEmoji = noEmoji && /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(value || '');

  const handleKeyDown = (e) => {
    if (e.key === '{' && !e.shiftKey) {
      e.preventDefault(); // Prevent the { from being typed
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) {
        setSelectorPosition({
          top: rect.bottom + 5,
          left: Math.max(rect.left, 10),
        });
      }
      setCursorPosition(e.target.selectionStart || 0);
      setShowVariables(true);
    }
  };

  const handleSelectVariable = (variable) => {
    const before = value.slice(0, cursorPosition);
    const after = value.slice(cursorPosition);
    const newValue = before + variable + after;
    onChange(newValue);
    setShowVariables(false);
    
    // Focus back and set cursor after variable
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
      <InputComponent
        ref={inputRef}
        type={multiline ? undefined : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={multiline ? rows : undefined}
        dir={dir}
        className={`w-full px-3 py-2 bg-white border rounded-lg text-sm focus:ring-2 outline-none transition-colors ${
          isOverLimit || hasEmoji
            ? 'border-red-300 focus:ring-red-200 focus:border-red-400' 
            : 'border-gray-200 focus:ring-teal-200 focus:border-teal-400'
        } ${multiline ? 'resize-none' : ''} ${className}`}
      />
      
      {/* Status bar */}
      <div className="flex items-center justify-between mt-1">
        <div className="text-xs text-gray-400">
          💡 הקלד <code className="bg-gray-100 px-1 rounded">{'{'}</code> למשתנה
        </div>
        
        <div className="flex items-center gap-2">
          {hasEmoji && (
            <span className="text-xs text-red-500">⚠️ ללא אימוג'י</span>
          )}
          {maxLength && (
            <span className={`text-xs ${
              isOverLimit ? 'text-red-500 font-medium' : 
              isNearLimit ? 'text-orange-500' : 'text-gray-400'
            }`}>
              {charCount}/{maxLength}
            </span>
          )}
        </div>
      </div>

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
