import Logo from '../atoms/Logo';

export default function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Logo size="lg" />
          {title && (
            <h2 className="mt-6 text-2xl font-bold text-gray-900">{title}</h2>
          )}
          {subtitle && (
            <p className="mt-2 text-gray-600">{subtitle}</p>
          )}
        </div>
        <div className="bg-white p-8 rounded-xl shadow-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
