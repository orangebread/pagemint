export function PinInstructionsFigure(): React.ReactNode {
  return (
    <svg
      role="img"
      aria-label="Chrome toolbar with the puzzle icon and the pin next to PageMint highlighted"
      viewBox="0 0 320 180"
      width="320"
      height="180"
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
    >
      <rect x="6" y="6" width="308" height="160" rx="8" fill="#FFFFFF" stroke="#D8CFB9" />
      <rect x="6" y="6" width="308" height="28" rx="8" fill="#ECE4D1" />
      <circle cx="20" cy="20" r="4" fill="#FF5F57" />
      <circle cx="34" cy="20" r="4" fill="#FEBC2E" />
      <circle cx="48" cy="20" r="4" fill="#28C840" />
      <rect x="80" y="14" width="160" height="12" rx="6" fill="#FFFFFF" stroke="#D8CFB9" />
      <rect x="248" y="11" width="18" height="18" rx="4" fill="#4A7A5A" opacity="0.18" />
      <text x="257" y="24" fontFamily="system-ui" fontSize="11" textAnchor="middle" fill="#4A7A5A" fontWeight="700">▦</text>
      <path d="M 230 6 Q 245 0 257 8" fill="none" stroke="#4A7A5A" strokeWidth="2" strokeLinecap="round" />
      <path d="M 252 4 L 257 8 L 253 12" fill="none" stroke="#4A7A5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="195" y="42" width="115" height="80" rx="6" fill="#FFFFFF" stroke="#D8CFB9" />
      <text x="205" y="58" fontFamily="system-ui" fontSize="10" fontWeight="700" fill="#17130E">Extensions</text>
      <line x1="205" y1="64" x2="300" y2="64" stroke="#D8CFB9" />
      <text x="205" y="80" fontFamily="system-ui" fontSize="10" fill="#17130E">PageMint</text>
      <circle cx="290" cy="77" r="7" fill="none" stroke="#4A7A5A" strokeWidth="2" />
      <path d="M 287 77 L 290 80 L 294 75" fill="none" stroke="#4A7A5A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 308 100 Q 320 92 298 82" fill="none" stroke="#4A7A5A" strokeWidth="2" strokeLinecap="round" />
      <path d="M 302 78 L 298 82 L 302 86" fill="none" stroke="#4A7A5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="205" y="100" fontFamily="system-ui" fontSize="10" fill="#766B58" opacity="0.5">—</text>
    </svg>
  );
}
