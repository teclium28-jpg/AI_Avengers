import React from "react";

interface FairShareIconProps {
  size?: number;
  className?: string;
}

/**
 * Minimalist, institutional emblem for FairShare.
 * Combines an interlocking 'F' & 'S' monogram with the progressive
 * max-min allocation tiers and an equilibrium fulcrum.
 */
export const FairShareIcon: React.FC<FairShareIconProps> = ({
  size = 32,
  className = "",
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform duration-200 hover:scale-105 ${className}`}
      aria-label="FairShare Emblem"
    >
      <defs>
        {/* Subtle, authoritative emerald-to-forest gradient */}
        <linearGradient
          id="fs-bg-grad"
          x1="0"
          y1="0"
          x2="36"
          y2="36"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#064e3b" />
        </linearGradient>

        {/* Glow for the equilibrium balance point */}
        <linearGradient
          id="fs-accent-grad"
          x1="10"
          y1="10"
          x2="26"
          y2="26"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>

        <filter id="fs-subtle-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000000" floodOpacity="0.2" />
        </filter>
      </defs>

      {/* Rounded Squircle Canvas */}
      <rect
        width="36"
        height="36"
        rx="9"
        fill="url(#fs-bg-grad)"
      />

      {/* Precision 1px crisp inset rim */}
      <rect
        x="0.75"
        y="0.75"
        width="34.5"
        height="34.5"
        rx="8.25"
        stroke="white"
        strokeOpacity="0.14"
        strokeWidth="1.5"
      />

      {/* The Monogram: Interlocking Equilibrium 'F' & 'S' */}
      <g filter="url(#fs-subtle-shadow)">
        {/* Top Ceiling Tier (F top bar / Stock Ceiling) */}
        <path
          d="M10 11H26"
          stroke="white"
          strokeWidth="3.2"
          strokeLinecap="round"
        />

        {/* Continuous Sinuous Backbone connecting F & S */}
        <path
          d="M10 11V17.5C10 18.8807 11.1193 20 12.5 20H23.5C24.8807 20 26 21.1193 26 22.5V23C26 24.3807 24.8807 25.5 23.5 25.5H10"
          stroke="white"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Progressive Max-Min Mid-Level Fulcrum Crossbeam */}
        <path
          d="M10 17.5H20"
          stroke="url(#fs-accent-grad)"
          strokeWidth="2.8"
          strokeLinecap="round"
        />

        {/* Equilibrium Anchor Nodes (Mathematically balanced) */}
        <circle cx="23.5" cy="13.2" r="1.5" fill="#a7f3d0" />
        <circle cx="12.5" cy="23.5" r="1.5" fill="#a7f3d0" />
      </g>
    </svg>
  );
};

interface FairShareLogoProps {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  className?: string;
}

export const FairShareLogo: React.FC<FairShareLogoProps> = ({
  size = "md",
  showTagline = true,
  className = "",
}) => {
  const iconSizes = {
    sm: 28,
    md: 34,
    lg: 42,
  };

  const textSizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
  };

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <FairShareIcon size={iconSizes[size]} />
      <div className="flex flex-col justify-center">
        <div className="flex items-center space-x-1.5">
          <span
            className={`font-bold tracking-tight text-zinc-950 font-sans leading-none ${textSizes[size]}`}
          >
            FairShare
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block mb-0.5" />
        </div>
        {showTagline && (
          <span className="text-[10px] text-zinc-400 font-mono tracking-tight uppercase font-medium mt-0.5">
            Allocation Platform
          </span>
        )}
      </div>
    </div>
  );
};
