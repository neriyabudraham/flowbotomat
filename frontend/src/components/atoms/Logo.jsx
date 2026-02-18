export default function Logo({ size = 'md' }) {
  const sizes = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-12',
  };

  return (
    <img 
      src="https://files.neriyabudraham.co.il/files/save_Botomat_%D7%9C%D7%95%D7%92%D7%95_20260218_ibhqd.png"
      alt="Botomat"
      className={`${sizes[size]} w-auto`}
    />
  );
}
