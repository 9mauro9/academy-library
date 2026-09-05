import React from 'react';
import type { SupportedLocale } from './types';

interface FlagProps {
  className?: string;
  size?: number;
}

export const USFlag: React.FC<FlagProps> = ({ className = '', size = 18 }) => (
  <svg
    width={size}
    height={Math.round(size * 0.75)}
    viewBox="0 0 640 480"
    className={`inline-block rounded-xs shadow-xs shrink-0 ${className}`}
    aria-hidden="true"
  >
    <g fillRule="evenodd">
      <path fill="#bd3d44" d="M0 0h640v480H0z"/>
      <path stroke="#fff" strokeWidth="37" d="M0 55.4h640M0 129.2h640M0 203.1h640M0 276.9h640M0 350.8h640M0 424.6h640"/>
      <path fill="#192f5d" d="M0 0h280v258.5H0z"/>
      <path fill="#fff" d="m17.5 15 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm-196 35 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm-140 35 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm-196 35 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm-140 35 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm-196 35 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm-140 35 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7zm56 0 4 12-10-7h13l-10 7z"/>
    </g>
  </svg>
);

export const ESFlag: React.FC<FlagProps> = ({ className = '', size = 18 }) => (
  <svg
    width={size}
    height={Math.round(size * 0.75)}
    viewBox="0 0 640 480"
    className={`inline-block rounded-xs shadow-xs shrink-0 ${className}`}
    aria-hidden="true"
  >
    <path fill="#c60b1e" d="M0 0h640v480H0z"/>
    <path fill="#ffc400" d="M0 120h640v240H0z"/>
    <g fill="#c60b1e">
      <circle cx="160" cy="240" r="40" fill="#ffc400" stroke="#c60b1e" strokeWidth="6"/>
      <path d="M140 220h40v40h-40z"/>
    </g>
  </svg>
);

export const ITFlag: React.FC<FlagProps> = ({ className = '', size = 18 }) => (
  <svg
    width={size}
    height={Math.round(size * 0.75)}
    viewBox="0 0 640 480"
    className={`inline-block rounded-xs shadow-xs shrink-0 ${className}`}
    aria-hidden="true"
  >
    <g fillRule="evenodd" strokeWidth="1pt">
      <path fill="#009246" d="M0 0h213.3v480H0z"/>
      <path fill="#fff" d="M213.3 0h213.4v480H213.3z"/>
      <path fill="#ce2b37" d="M426.7 0H640v480H426.7z"/>
    </g>
  </svg>
);

export const FRFlag: React.FC<FlagProps> = ({ className = '', size = 18 }) => (
  <svg
    width={size}
    height={Math.round(size * 0.75)}
    viewBox="0 0 640 480"
    className={`inline-block rounded-xs shadow-xs shrink-0 ${className}`}
    aria-hidden="true"
  >
    <g fillRule="evenodd" strokeWidth="1pt">
      <path fill="#002654" d="M0 0h213.3v480H0z"/>
      <path fill="#ce1126" d="M426.7 0H640v480H426.7z"/>
      <path fill="#fff" d="M213.3 0h213.4v480H213.3z"/>
    </g>
  </svg>
);

export const DEFlag: React.FC<FlagProps> = ({ className = '', size = 18 }) => (
  <svg
    width={size}
    height={Math.round(size * 0.75)}
    viewBox="0 0 640 480"
    className={`inline-block rounded-xs shadow-xs shrink-0 ${className}`}
    aria-hidden="true"
  >
    <path fill="#000" d="M0 0h640v160H0z"/>
    <path fill="#d00" d="M0 160h640v160H0z"/>
    <path fill="#ffce00" d="M0 320h640v160H0z"/>
  </svg>
);

export const PLFlag: React.FC<FlagProps> = ({ className = '', size = 18 }) => (
  <svg
    width={size}
    height={Math.round(size * 0.75)}
    viewBox="0 0 640 480"
    className={`inline-block rounded-xs shadow-xs shrink-0 border border-slate-600/30 ${className}`}
    aria-hidden="true"
  >
    <path fill="#fff" d="M0 0h640v240H0z"/>
    <path fill="#dc143c" d="M0 240h640v240H0z"/>
  </svg>
);

export const BRFlag: React.FC<FlagProps> = ({ className = '', size = 18 }) => (
  <svg
    width={size}
    height={Math.round(size * 0.75)}
    viewBox="0 0 640 480"
    className={`inline-block rounded-xs shadow-xs shrink-0 ${className}`}
    aria-hidden="true"
  >
    <path fill="#009b3a" d="M0 0h640v480H0z"/>
    <path fill="#fedf00" d="M320 40 600 240 320 440 40 240z"/>
    <circle cx="320" cy="240" r="120" fill="#002776"/>
    <path fill="#fff" d="M205 255a120 120 0 0 1 228-30 122 122 0 0 0-228 30z"/>
  </svg>
);

export const FlagIcon: React.FC<{ locale: SupportedLocale; size?: number; className?: string }> = ({
  locale,
  size = 18,
  className = '',
}) => {
  switch (locale) {
    case 'es-ES':
      return <ESFlag size={size} className={className} />;
    case 'it-IT':
      return <ITFlag size={size} className={className} />;
    case 'fr-FR':
      return <FRFlag size={size} className={className} />;
    case 'de-DE':
      return <DEFlag size={size} className={className} />;
    case 'pt-BR':
      return <BRFlag size={size} className={className} />;
    case 'pl-PL':
      return <PLFlag size={size} className={className} />;
    case 'en-US':
    default:
      return <USFlag size={size} className={className} />;
  }
};
