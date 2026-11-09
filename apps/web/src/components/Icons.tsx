import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconGrid = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
  </Base>
);

export const IconWallet = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h11.5A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20H6a2.5 2.5 0 0 1-2.5-2.5z" />
    <path d="M3.5 9.5h13A2.5 2.5 0 0 1 19 12v1.5" />
    <circle cx="16.5" cy="12.8" r="1" />
  </Base>
);

export const IconArrows = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 8h13" />
    <path d="m14 5 3 3-3 3" />
    <path d="M20 16H7" />
    <path d="m10 13-3 3 3 3" />
  </Base>
);

export const IconReceipt = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8z" />
    <path d="M9 8h6M9 11.5h6M9 15h3.5" />
  </Base>
);

export const IconUsers = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c0-3.1 2.5-5.5 5.5-5.5s5.5 2.4 5.5 5.5" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.7" />
    <path d="M17.6 14.8c1.8.7 2.9 2.4 2.9 4.4" />
  </Base>
);

export const IconSettings = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M4.5 12H2.1M21.9 12h-2.4M6.7 6.7 5 5M19 19l-1.7-1.7M17.3 6.7 19 5M5 19l1.7-1.7" />
  </Base>
);

export const IconBell = (p: IconProps) => (
  <Base {...p}>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5" />
    <path d="M10 19a2.2 2.2 0 0 0 4 0" />
  </Base>
);

export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="10.7" cy="10.7" r="6.7" />
    <path d="m16 16 4.2 4.2" />
  </Base>
);

export const IconArrowUpRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </Base>
);

export const IconArrowDownLeft = (p: IconProps) => (
  <Base {...p}>
    <path d="M17 7 7 17" />
    <path d="M16 17H7V8" />
  </Base>
);

export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconChevronDown = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);

export const IconChevronRight = (p: IconProps) => (
  <Base {...p}>
    <path d="m9 6 6 6-6 6" />
  </Base>
);

export const IconCopy = (p: IconProps) => (
  <Base {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Base>
);

export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const IconLogout = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 8l-4 4 4 4" />
    <path d="M6 12h9" />
  </Base>
);

export const IconShield = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6z" />
    <path d="m9 12 2 2 4-4.5" />
  </Base>
);

export const IconBank = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 9.5 12 4l8.5 5.5" />
    <path d="M5 10.5V19M9.5 10.5V19M14.5 10.5V19M19 10.5V19" />
    <path d="M3.5 21h17" />
  </Base>
);

export const IconTrash = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V4.5h6V7" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v5M14 11v5" />
  </Base>
);

export const IconSpark = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </Base>
);
