export default function Logo({ size = 'md' }) {
  const sizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <div className={`font-bold text-primary-500 ${sizes[size]}`}>
      Botomat
    </div>
  );
}
