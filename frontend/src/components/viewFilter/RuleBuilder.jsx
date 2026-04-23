import { useMemo } from 'react';
import { Plus, X, Layers, ChevronDown, ChevronUp } from 'lucide-react';

// Generic boolean-tree rule builder for advanced filtering.
//
// Node shape:
//   Group: { op: 'AND' | 'OR', children: [Node, ...] }
//   Leaf:  { field, operator, value }
//
// Props:
//   value       — the current root node
//   onChange    — (newNode) => void
//   fields      — [{ key, label, type: 'text'|'array'|'boolean'|'number', options?: [{value,label}] }]
//   maxDepth    — cap nesting depth (default 4)
//
// Kept intentionally flexible so we can reuse for the local cleanup page.
export default function RuleBuilder({ value, onChange, fields, maxDepth = 4 }) {
  const root = value || { op: 'AND', children: [] };

  const handleRootChange = (next) => onChange?.(next);

  return (
    <div className="space-y-2" dir="rtl">
      <NodeEditor
        node={root}
        path={[]}
        depth={0}
        maxDepth={maxDepth}
        fields={fields}
        onChange={handleRootChange}
        onRemove={null /* can't remove root */}
      />
    </div>
  );
}

function isGroup(node) { return node && Array.isArray(node.children); }

function NodeEditor({ node, path, depth, maxDepth, fields, onChange, onRemove }) {
  if (isGroup(node)) {
    return <GroupEditor node={node} path={path} depth={depth} maxDepth={maxDepth} fields={fields} onChange={onChange} onRemove={onRemove} />;
  }
  return <LeafEditor node={node} fields={fields} onChange={onChange} onRemove={onRemove} />;
}

function GroupEditor({ node, path, depth, maxDepth, fields, onChange, onRemove }) {
  const op = node.op === 'OR' ? 'OR' : 'AND';
  const children = node.children || [];

  const setOp = (newOp) => onChange({ ...node, op: newOp });
  const setChildAt = (idx, childNode) => {
    const next = [...children];
    next[idx] = childNode;
    onChange({ ...node, children: next });
  };
  const removeChildAt = (idx) => {
    const next = children.filter((_, i) => i !== idx);
    onChange({ ...node, children: next });
  };
  const addLeaf = () => {
    const f = fields[0];
    onChange({
      ...node,
      children: [...children, { field: f?.key || 'display_name', operator: defaultOperatorFor(f), value: '' }],
    });
  };
  const addGroup = () => {
    if (depth >= maxDepth) return;
    onChange({
      ...node,
      children: [...children, { op: op === 'AND' ? 'OR' : 'AND', children: [] }],
    });
  };

  // Color depth so nested groups are visually distinct
  const bgByDepth = ['bg-purple-50/60', 'bg-blue-50/60', 'bg-green-50/60', 'bg-orange-50/60'];
  const borderByDepth = ['border-purple-200', 'border-blue-200', 'border-green-200', 'border-orange-200'];
  const bg = bgByDepth[depth % bgByDepth.length];
  const border = borderByDepth[depth % borderByDepth.length];

  return (
    <div className={`${bg} ${border} border-2 border-dashed rounded-xl p-3`}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Layers className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <div className="inline-flex border border-gray-200 rounded-lg bg-white overflow-hidden">
          <button type="button" onClick={() => setOp('AND')}
            className={`px-3 py-1 text-xs font-medium ${op === 'AND' ? 'bg-purple-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            גם וגם (AND)
          </button>
          <button type="button" onClick={() => setOp('OR')}
            className={`px-3 py-1 text-xs font-medium ${op === 'OR' ? 'bg-purple-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            או (OR)
          </button>
        </div>
        <span className="text-xs text-gray-500">
          {children.length} {children.length === 1 ? 'תנאי' : 'תנאים'}
        </span>
        <div className="mr-auto flex items-center gap-1">
          <button type="button" onClick={addLeaf}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
            <Plus className="w-3.5 h-3.5" /> תנאי
          </button>
          {depth < maxDepth && (
            <button type="button" onClick={addGroup}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
              <Plus className="w-3.5 h-3.5" /> קבוצה
            </button>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove}
              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {children.length === 0 ? (
        <p className="text-xs text-gray-500 py-2 px-2">הוסף תנאי או קבוצה</p>
      ) : (
        <div className="space-y-2">
          {children.map((child, idx) => (
            <div key={idx} className="flex items-start gap-2">
              {idx > 0 && (
                <span className="mt-2 text-xs font-bold text-gray-500 px-2 py-0.5 bg-white border border-gray-200 rounded-full flex-shrink-0">
                  {op === 'AND' ? 'וגם' : 'או'}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <NodeEditor
                  node={child}
                  path={[...path, idx]}
                  depth={depth + 1}
                  maxDepth={maxDepth}
                  fields={fields}
                  onChange={(n) => setChildAt(idx, n)}
                  onRemove={() => removeChildAt(idx)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeafEditor({ node, fields, onChange, onRemove }) {
  const field = fields.find(f => f.key === node.field) || fields[0];
  const ops = operatorsForField(field);
  const currentOp = ops.find(o => o.value === node.operator) || ops[0];

  const setField = (key) => {
    const f = fields.find(x => x.key === key) || fields[0];
    onChange({ field: key, operator: defaultOperatorFor(f), value: emptyValueFor(f) });
  };
  const setOp = (opVal) => onChange({ ...node, operator: opVal, value: node.value });
  const setValue = (v) => onChange({ ...node, value: v });

  const needsValue = !['is_empty', 'is_not_empty', 'is_true', 'is_false'].includes(currentOp?.value);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2 flex items-center gap-2 flex-wrap">
      <select value={field?.key || ''} onChange={e => setField(e.target.value)}
        className="px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white min-w-[140px]">
        {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>

      <select value={currentOp?.value || ''} onChange={e => setOp(e.target.value)}
        className="px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white">
        {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {needsValue && (
        <ValueInput field={field} value={node.value} onChange={setValue} />
      )}

      <button type="button" onClick={onRemove}
        className="mr-auto p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ValueInput({ field, value, onChange }) {
  if (!field) return null;

  if (field.type === 'array' && Array.isArray(field.options)) {
    // Multi-select value (comma-joined in the input list)
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-1 max-w-[420px]">
        {field.options.map(opt => {
          const isSelected = selected.includes(opt.value);
          return (
            <button key={opt.value} type="button"
              onClick={() => {
                if (isSelected) onChange(selected.filter(v => v !== opt.value));
                else onChange([...selected, opt.value]);
              }}
              className={`px-2 py-0.5 text-xs rounded-full border ${
                isSelected ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (field.options && !field.type) {
    return (
      <select value={value || ''} onChange={e => onChange(e.target.value)}
        className="px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white">
        <option value="">—</option>
        {field.options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    );
  }

  if (field.type === 'number') {
    return (
      <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value)}
        className="px-2 py-1.5 text-sm border border-gray-200 rounded-md w-28" />
    );
  }

  // text default
  return (
    <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)}
      placeholder={field.placeholder || ''} dir={field.ltr ? 'ltr' : 'auto'}
      className="px-2 py-1.5 text-sm border border-gray-200 rounded-md flex-1 min-w-[160px]" />
  );
}

function operatorsForField(field) {
  if (!field) return [];
  if (field.type === 'array') {
    return [
      { value: 'any_of',      label: 'לפחות באחד מ...' },
      { value: 'all_of',      label: 'בכולם' },
      { value: 'none_of',     label: 'באף אחד מ...' },
      { value: 'is_empty',    label: 'ריק (ללא)' },
      { value: 'is_not_empty',label: 'לא ריק (עם)' },
    ];
  }
  if (field.type === 'boolean') {
    return [
      { value: 'is_true',  label: 'כן' },
      { value: 'is_false', label: 'לא' },
    ];
  }
  if (field.type === 'number') {
    return [
      { value: 'equals',       label: 'שווה' },
      { value: 'not_equals',   label: 'שונה' },
      { value: 'gt',           label: 'גדול מ' },
      { value: 'lt',           label: 'קטן מ' },
      { value: 'gte',          label: 'גדול־שווה' },
      { value: 'lte',          label: 'קטן־שווה' },
      { value: 'is_empty',     label: 'ריק' },
      { value: 'is_not_empty', label: 'לא ריק' },
    ];
  }
  // text
  return [
    { value: 'contains',      label: 'מכיל' },
    { value: 'not_contains',  label: 'לא מכיל' },
    { value: 'starts_with',   label: 'מתחיל ב' },
    { value: 'ends_with',     label: 'מסתיים ב' },
    { value: 'equals',        label: 'שווה בדיוק' },
    { value: 'not_equals',    label: 'שונה מ' },
    { value: 'is_empty',      label: 'ריק' },
    { value: 'is_not_empty',  label: 'לא ריק' },
    { value: 'regex',         label: 'התאמה לביטוי רגולרי' },
    { value: 'not_regex',     label: 'לא תואם ביטוי רגולרי' },
  ];
}

function defaultOperatorFor(field) {
  const ops = operatorsForField(field);
  return ops[0]?.value || 'contains';
}

function emptyValueFor(field) {
  if (!field) return '';
  if (field.type === 'array') return [];
  if (field.type === 'boolean') return true;
  return '';
}

// Helper: is the tree empty (no children)?
export function isEmptyRule(root) {
  if (!root) return true;
  if (!Array.isArray(root.children)) return false;
  return root.children.length === 0;
}
