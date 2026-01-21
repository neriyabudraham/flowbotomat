import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Lock, Eye, Database, Trash2, Mail } from 'lucide-react';
import Logo from '../components/atoms/Logo';

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" dir="rtl">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900"
          >
            <ArrowRight className="w-5 h-5" />
            <span>חזרה</span>
          </button>
          <Logo />
          <div className="w-20" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 md:p-12">
          {/* Title */}
          <div className="text-center mb-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Shield className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              מדיניות פרטיות
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              עודכן לאחרונה: ינואר 2026
            </p>
          </div>

          {/* Content */}
          <div className="prose prose-lg dark:prose-invert max-w-none">
            {/* Introduction */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-600" />
                מבוא
              </h2>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                FlowBotomat ("אנחנו", "שלנו" או "החברה") מכבדת את פרטיות המשתמשים שלה. 
                מדיניות פרטיות זו מסבירה כיצד אנו אוספים, משתמשים, מאחסנים ומגנים על המידע שלך 
                כאשר אתה משתמש בשירותים שלנו.
              </p>
            </section>

            {/* Data Collection */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                המידע שאנו אוספים
              </h2>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2">מידע שאתה מספק לנו:</h3>
                  <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
                    <li>שם ופרטי התקשרות (אימייל, טלפון)</li>
                    <li>פרטי כרטיס אשראי לצורך תשלום</li>
                    <li>תוכן הבוטים שאתה יוצר</li>
                    <li>הודעות WhatsApp שעוברות דרך המערכת</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2">מידע שנאסף אוטומטית:</h3>
                  <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
                    <li>כתובת IP ומזהה מכשיר</li>
                    <li>נתוני שימוש ואנליטיקה</li>
                    <li>Cookies ומזהים דומים</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Data Usage */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                כיצד אנו משתמשים במידע
              </h2>
              <ul className="space-y-3">
                {[
                  'לספק ולתחזק את השירות',
                  'לעבד תשלומים ולנהל את החשבון שלך',
                  'לשלוח עדכונים והתראות חשובות',
                  'לשפר את השירות ולפתח תכונות חדשות',
                  'לזהות ולמנוע הונאות ושימוש לרעה',
                  'לעמוד בדרישות החוק'
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-gray-600 dark:text-gray-300">
                    <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            {/* Data Security */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-blue-600" />
                אבטחת המידע
              </h2>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                אנו נוקטים באמצעי אבטחה מתקדמים להגנה על המידע שלך:
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { title: 'הצפנת SSL', desc: 'כל התקשורת מוצפנת' },
                  { title: 'PCI DSS', desc: 'תקן אבטחה לתשלומים' },
                  { title: 'גיבויים', desc: 'גיבוי יומי של המידע' },
                  { title: 'בקרת גישה', desc: 'הרשאות מוגבלות לעובדים' },
                ].map((item, i) => (
                  <div key={i} className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <div className="font-medium text-green-800 dark:text-green-300">{item.title}</div>
                    <div className="text-sm text-green-600 dark:text-green-400">{item.desc}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Data Sharing */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                שיתוף מידע עם צדדים שלישיים
              </h2>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                אנו לא מוכרים את המידע שלך. אנו עשויים לשתף מידע עם:
              </p>
              <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                <li>• <strong>ספקי שירות:</strong> חברות המסייעות לנו להפעיל את השירות (אחסון, תשלומים)</li>
                <li>• <strong>WhatsApp/Meta:</strong> לצורך חיבור חשבון WhatsApp שלך</li>
                <li>• <strong>רשויות:</strong> כאשר נדרש על פי חוק</li>
              </ul>
            </section>

            {/* User Rights */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-blue-600" />
                הזכויות שלך
              </h2>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
                יש לך את הזכויות הבאות בנוגע למידע שלך:
              </p>
              <div className="space-y-3">
                {[
                  { title: 'גישה', desc: 'לבקש עותק של המידע שאנו מחזיקים עליך' },
                  { title: 'תיקון', desc: 'לבקש תיקון של מידע שגוי' },
                  { title: 'מחיקה', desc: 'לבקש מחיקת המידע שלך ("הזכות להישכח")' },
                  { title: 'הגבלה', desc: 'להגביל את העיבוד של המידע שלך' },
                  { title: 'ניוד', desc: 'לקבל את המידע שלך בפורמט מובנה' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="font-medium text-gray-900 dark:text-white min-w-[80px]">{item.title}</div>
                    <div className="text-gray-600 dark:text-gray-300">{item.desc}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Contact */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600" />
                יצירת קשר
              </h2>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                לשאלות או בקשות בנוגע למדיניות פרטיות זו, ניתן לפנות אלינו:
              </p>
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <p className="text-blue-800 dark:text-blue-300">
                  <strong>אימייל:</strong> office@neriyabudraham.co.il
                </p>
                <p className="text-blue-800 dark:text-blue-300 mt-2">
                  <strong>חברה:</strong> בוטומט שירותי אוטומציה
                </p>
              </div>
            </section>

            {/* Updates */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                עדכונים למדיניות
              </h2>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                אנו עשויים לעדכן מדיניות זו מעת לעת. במקרה של שינויים מהותיים, 
                נודיע לך באמצעות אימייל או הודעה באתר. המשך השימוש בשירות לאחר עדכון 
                מהווה הסכמה למדיניות המעודכנת.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
