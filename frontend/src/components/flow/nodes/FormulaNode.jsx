import { memo } from 'react';
import { Calculator } from 'lucide-react';
import BaseNode from './BaseNode';

function FormulaNode({ data, selected }) {
  const steps = data.steps || [];

  return (
    <BaseNode
      data={data}
      selected={selected}
      type="formula"
      color="emerald"
      icon={Calculator}
      title="חישוב / נוסחה"
    >
      <div className="space-y-2">
        {steps.length === 0 ? (
          <div className="text-center py-2 text-gray-400 text-xs">
            לחץ להגדרת חישוב
          </div>
        ) : (
          steps.map((step, i) => (
            <div key={i} className="bg-emerald-50 rounded-lg px-3 py-2">
              <div className="text-xs font-medium text-emerald-700 truncate">
                {step.outputVar ? `{{${step.outputVar}}}` : '—'}
                {' = '}
                <span className="font-mono">{step.expression || '...'}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </BaseNode>
  );
}

export default memo(FormulaNode);
