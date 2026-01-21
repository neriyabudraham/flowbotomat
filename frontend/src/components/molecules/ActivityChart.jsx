export default function ActivityChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h3 className="font-semibold mb-4">פעילות ב-7 ימים אחרונים</h3>
        <div className="h-32 flex items-center justify-center text-gray-400">
          אין נתונים להצגה
        </div>
      </div>
    );
  }

  const maxCount = Math.max(...data.map(d => parseInt(d.count)), 1);

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
      <h3 className="font-semibold mb-4">פעילות ב-7 ימים אחרונים</h3>
      <div className="flex items-end justify-between h-32 gap-2">
        {data.map((item, i) => {
          const height = (parseInt(item.count) / maxCount) * 100;
          const date = new Date(item.date);
          const day = date.toLocaleDateString('he-IL', { weekday: 'short' });
          
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-gray-500">{item.count}</span>
              <div 
                className="w-full bg-teal-500 rounded-t transition-all"
                style={{ height: `${Math.max(height, 4)}%` }}
              />
              <span className="text-xs text-gray-500">{day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
