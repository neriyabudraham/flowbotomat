export default function MessageEditor({ data, onUpdate }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          תוכן ההודעה
        </label>
        <textarea
          value={data.content || ''}
          onChange={(e) => onUpdate({ content: e.target.value })}
          placeholder="כתוב את ההודעה כאן..."
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400 outline-none"
          rows={6}
        />
      </div>
      
      <div className="bg-teal-50 rounded-xl p-4">
        <h4 className="font-medium text-teal-800 mb-2">משתנים זמינים</h4>
        <div className="space-y-1 text-sm text-teal-700">
          <div className="flex items-center justify-between">
            <code className="bg-teal-100 px-2 py-0.5 rounded">{'{{name}}'}</code>
            <span>שם איש קשר</span>
          </div>
          <div className="flex items-center justify-between">
            <code className="bg-teal-100 px-2 py-0.5 rounded">{'{{phone}}'}</code>
            <span>מספר טלפון</span>
          </div>
          <div className="flex items-center justify-between">
            <code className="bg-teal-100 px-2 py-0.5 rounded">{'{{message}}'}</code>
            <span>ההודעה האחרונה</span>
          </div>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          תצוגה מקדימה
        </label>
        <div className="bg-gray-100 rounded-xl p-4 text-sm whitespace-pre-wrap">
          {data.content || <span className="text-gray-400">ההודעה תופיע כאן...</span>}
        </div>
      </div>
    </div>
  );
}
