const variants = {
  error: 'bg-red-50 border-red-200 text-red-700',
  success: 'bg-green-50 border-green-200 text-green-700',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  info: 'bg-blue-50 border-blue-200 text-blue-700',
};

export default function Alert({ children, variant = 'info' }) {
  if (!children) return null;

  return (
    <div className={`p-3 rounded-lg border ${variants[variant]}`}>
      {children}
    </div>
  );
}
