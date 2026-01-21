export default function DelayEditor({ data, onUpdate }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        הגדר כמה זמן להמתין לפני המשך הפלואו.
      </p>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          משך ההשהייה
        </label>
        <div className="flex gap-3">
          <input
            type="number"
            value={data.delay || 1}
            onChange={(e) => onUpdate({ delay: Math.max(1, parseInt(e.target.value) || 1) })}
            min={1}
            className="w-24 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-center focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
          />
          <select
            value={data.unit || 'seconds'}
            onChange={(e) => onUpdate({ unit: e.target.value })}
            className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
          >
            <option value="seconds">שניות</option>
            <option value="minutes">דקות</option>
            <option value="hours">שעות</option>
          </select>
        </div>
      </div>
      
      <div className="bg-blue-50 rounded-xl p-4">
        <h4 className="font-medium text-blue-800 mb-2">שים לב</h4>
        <p className="text-sm text-blue-700">
          ההשהייה מתבצעת לפני המשך הפלואו לרכיב הבא.
          המשתמש לא יקבל שום אינדיקציה במהלך ההמתנה.
        </p>
      </div>
      
      <div className="text-center py-4">
        <div className="text-4xl font-bold text-blue-600">
          {data.delay || 1}
        </div>
        <div className="text-gray-500">
          {data.unit === 'minutes' ? 'דקות' : data.unit === 'hours' ? 'שעות' : 'שניות'}
        </div>
      </div>
    </div>
  );
}
