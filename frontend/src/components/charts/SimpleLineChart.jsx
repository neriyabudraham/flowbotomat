import { useMemo } from 'react';

export default function SimpleLineChart({ data, dataKey, color = '#3B82F6', height = 200, showArea = false }) {
  const { points, maxValue, minValue, labels } = useMemo(() => {
    if (!data || data.length === 0) return { points: '', maxValue: 0, minValue: 0, labels: [] };
    
    const values = data.map(d => d[dataKey] || 0);
    const max = Math.max(...values, 1);
    const min = Math.min(...values);
    
    const width = 100;
    const chartHeight = 100;
    const padding = 5;
    
    const pts = data.map((d, i) => {
      const x = padding + (i / (data.length - 1 || 1)) * (width - padding * 2);
      const y = chartHeight - padding - ((d[dataKey] - min) / (max - min || 1)) * (chartHeight - padding * 2);
      return { x, y, value: d[dataKey], date: d.date };
    });
    
    const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
    
    // Area path
    const areaPath = `M ${pts[0].x},${chartHeight - padding} L ${pointsStr} L ${pts[pts.length - 1].x},${chartHeight - padding} Z`;
    
    return { 
      points: pointsStr, 
      areaPath,
      maxValue: max, 
      minValue: min, 
      labels: pts 
    };
  }, [data, dataKey]);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-gray-400" style={{ height }}>
        אין נתונים
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(y => (
          <line 
            key={y} 
            x1="5" y1={y} x2="95" y2={y} 
            stroke="#e5e7eb" 
            strokeWidth="0.3"
          />
        ))}
        
        {/* Area fill */}
        {showArea && points && (
          <polygon
            points={`5,95 ${points} 95,95`}
            fill={color}
            fillOpacity="0.1"
          />
        )}
        
        {/* Line */}
        {points && (
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        
        {/* Data points */}
        {labels.map((point, i) => (
          <circle
            key={i}
            cx={point.x}
            cy={point.y}
            r="1.5"
            fill={color}
            className="hover:r-3 transition-all"
          />
        ))}
      </svg>
      
      {/* Y axis labels */}
      <div className="absolute top-0 left-0 h-full flex flex-col justify-between text-[10px] text-gray-400 -ml-1">
        <span>{maxValue}</span>
        <span>{Math.round((maxValue + minValue) / 2)}</span>
        <span>{minValue}</span>
      </div>
    </div>
  );
}
