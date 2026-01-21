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
}) {
  const [showVariables, setShowVariables] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectorPosition, setSelectorPosition] = useState({ top: 0, left: 0 });
  const inputRef = useRef(null);

  const charCount = value?.length || 0;
  const isOverLimit = maxLength && charCount > maxLength;
  const isNearLimit = maxLength && charCount > maxLength * 0.9;

  const handleKeyDown = (e) => {
    if (e.key === '{') {
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) {
        setSelectorPosition({
          top: rect.bottom + 5,
          left: Math.max(rect.left, 10),
        });
      }
      setShowVariables(true);
      setCursorPosition(e.target.selectionStart || 0);
    }
  };

  const handleSelectVariable = (variable) => {
    const before = value.slice(0, cursorPosition);
    const after = value.slice(cursorPosition);
    const newValue = before + variable + after;
    onChange(newValue);
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
          isOverLimit 
            ? 'border-red-300 focus:ring-red-200 focus:border-red-400' 
            : 'border-gray-200 focus:ring-teal-200 focus:border-teal-400'
        } ${multiline ? 'resize-none' : ''} ${className}`}
      />
      
      {/* Character count */}
      {maxLength && (
        <div className={`absolute left-2 bottom-2 text-xs ${
          isOverLimit ? 'text-red-500 font-medium' : 
          isNearLimit ? 'text-orange-500' : 'text-gray-400'
        }`}>
          {charCount}/{maxLength}
          {isOverLimit && ' ⚠️'}
        </div>
      )}

      {/* Variable hint */}
      <div className="text-xs text-gray-400 mt-1">
        💡 הקלד <code className="bg-gray-100 px-1 rounded">{'{'}</code> להוספת משתנה
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
