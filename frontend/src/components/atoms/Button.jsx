const variants = {
  primary: 'bg-primary-500 hover:bg-primary-600 text-white',
  secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
  danger: 'bg-red-500 hover:bg-red-600 text-white',
  ghost: 'bg-transparent hover:bg-gray-100 text-gray-700',
};

export default function Button({ 
  children, 
  variant = 'primary', 
  isLoading = false,
  disabled = false,
  className = '',
  ...props 
}) {
  return (
    <button
      disabled={disabled || isLoading}
      className={`
        px-4 py-2 rounded-lg font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${className}
      `}
      {...props}
    >
      {isLoading ? '...' : children}
    </button>
  );
}
