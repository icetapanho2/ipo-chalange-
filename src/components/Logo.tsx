/** Logo I.POnte em SVG: "I.PO" a azul-escuro, a ponte com as duas pessoas e o círculo verde, e "TE" a azul-claro. */
export function Logo({ className = "h-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 700 165" className={`${className} w-auto`} role="img" aria-label="I.POnte">
      <defs>
        <linearGradient id="logo-ponte" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#3f8fb8" />
          <stop offset="0.55" stopColor="#4aa3a6" />
          <stop offset="1" stopColor="#2f7fb5" />
        </linearGradient>
      </defs>
      <text x="22" y="150" fontFamily="Arial Black, Arial, Helvetica, sans-serif" fontWeight="900" fontSize="128" fill="#0f4c75" stroke="#0f4c75" strokeWidth="9" strokeLinejoin="round" textLength="290" lengthAdjust="spacingAndGlyphs">
        I.PO
      </text>
      {/* A ponte: um arco largo, mais claro de um lado */}
      <path d="M340 150 C 352 60, 402 45, 432 45 C 462 45, 512 60, 524 150" fill="none" stroke="url(#logo-ponte)" strokeWidth="30" strokeLinecap="round" />
      <circle cx="372" cy="68" r="12" fill="#1f6fa3" />
      <circle cx="492" cy="68" r="12" fill="#2f7fb5" />
      <circle cx="432" cy="22" r="16" fill="#8fd0b0" />
      <text x="548" y="150" fontFamily="Arial, Helvetica, sans-serif" fontWeight="300" fontSize="122" fill="#4a90c2" textLength="140" lengthAdjust="spacingAndGlyphs">
        TE
      </text>
    </svg>
  );
}
