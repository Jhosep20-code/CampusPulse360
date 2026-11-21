import { useId } from "react";

interface LogoProps {
  size?: number;
  className?: string;
  /** Si es true no se anuncia a lectores de pantalla (hay texto al lado). */
  decorative?: boolean;
}

/**
 * Anillo de 360 grados abierto atravesado por una onda de pulso cuyo pico
 * forma una silueta escalonada de edificio; nodo dorado de "dato vivo".
 */
export function Logo({ size = 36, className, decorative = false }: LogoProps) {
  const gid = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "CampusPulse 360" })}
    >
      <defs>
        <linearGradient id={gid} x1="4" y1="44" x2="44" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22D3D6" />
          <stop offset="1" stopColor="#2962FF" />
        </linearGradient>
      </defs>
      <circle
        cx="24"
        cy="24"
        r="19"
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray="86 14"
        strokeDashoffset="-7"
      />
      <path
        d="M5 24H12L14.5 19.5L17 27L19.5 24H23V17H26V11.5H29.5V18H33V24H41"
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="43" cy="24" r="2.8" fill="#F0B95B" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={compact ? 28 : 34} decorative />
      <span className="font-display text-[15px] font-semibold leading-none tracking-tight text-ink">
        CampusPulse <span className="text-ok">360</span>
      </span>
    </span>
  );
}
