import { memo } from 'react';
import { Clock } from 'lucide-react';
import BaseNode from './BaseNode';

const unitLabels = { seconds: 'ש׳', minutes: 'ד׳', hours: 'שע׳' };

function DelayNode({ data, selected }) {
  return (
    <BaseNode
      data={data}
      selected={selected}
      type="delay"
      color="blue"
      icon={Clock}
      title="השהייה"
    >
      <div className="bg-blue-50 rounded-lg p-4 text-center">
        <span className="text-3xl font-bold text-blue-600">{data.delay || 1}</span>
        <span className="text-blue-500 text-lg mr-1">{unitLabels[data.unit] || 'ש׳'}</span>
      </div>
    </BaseNode>
  );
}

export default memo(DelayNode);
