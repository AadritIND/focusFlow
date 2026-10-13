import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

const svg = (path: ReactNode, viewBox = '0 0 24 24') =>
  function Icon({ size = 16, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={className}
      >
        {path}
      </svg>
    );
  };

export const Play = svg(<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />);
export const Pause = svg(
  <>
    <rect x="7" y="5" width="3.4" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.6" y="5" width="3.4" height="14" rx="1" fill="currentColor" stroke="none" />
  </>,
);
export const Reset = svg(
  <>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.2 4.2v4.4h4.4" />
  </>,
);
export const Skip = svg(
  <>
    <path d="M5.5 5.5 15 12l-9.5 6.5z" />
    <path d="M18.5 5.5v13" />
  </>,
);
export const Stop = svg(<rect x="6" y="6" width="12" height="12" rx="2" />);
export const Gear = svg(
  <>
    <path d="M4 7.5h6M18 7.5h2M4 12h2M14 12h6M4 16.5h5M17 16.5h3" />
    <circle cx="15.5" cy="7.5" r="2.2" />
    <circle cx="11.5" cy="12" r="2.2" />
    <circle cx="13.5" cy="16.5" r="2.2" />
  </>,
);
export const History = svg(
  <>
    <path d="M3.4 12a8.6 8.6 0 1 0 2.7-6.2" />
    <path d="M3.2 4.2v4.5h4.5" />
    <path d="M12 7.6V12l3 1.8" />
  </>,
);
export const Globe = svg(
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M3.6 9.4h16.8M3.6 14.6h16.8" />
    <path d="M12 3.4c2.2 2.4 3.3 5.3 3.3 8.6S14.2 18.2 12 20.6c-2.2-2.4-3.3-5.3-3.3-8.6S9.8 5.8 12 3.4z" />
  </>,
);
export const Plus = svg(<path d="M12 5v14M5 12h14" />);
export const Close = svg(<path d="M6 6l12 12M18 6L6 18" />);
export const Check = svg(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const Trash = svg(
  <>
    <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2h9.2L17.5 7" />
  </>,
);
export const Pencil = svg(
  <>
    <path d="M4.5 19.5h4L19 8.9a2.1 2.1 0 0 0-3-3L4.5 16.5z" />
    <path d="M14.8 7.1l2.9 2.9" />
  </>,
);
export const Share = svg(
  <>
    <path d="M12 15.5V4.2" />
    <path d="M8.2 7.8 12 4l3.8 3.8" />
    <path d="M5.5 13.5v5.2a1.6 1.6 0 0 0 1.6 1.6h9.8a1.6 1.6 0 0 0 1.6-1.6v-5.2" />
  </>,
);
export const Sun = svg(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
  </>,
);
export const Moon = svg(<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />);
export const Bulb = svg(
  <>
    <path d="M9 18.5h6M10 21h4" />
    <path d="M12 3.5a5.5 5.5 0 0 0-3.2 9.9V15h6.4v-1.6A5.5 5.5 0 0 0 12 3.5z" />
  </>,
);
export const Bolt = svg(<path d="M13.5 3 6 13.4h4.6L10 21l7.6-10.5H13z" />);
export const People = svg(
  <>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M2.8 20c0-3.4 2.8-6 6.2-6s6.2 2.6 6.2 6" />
    <path d="M16.4 5.6a3 3 0 0 1 0 5.9M18 14.3c2 .7 3.4 2.5 3.4 4.7" />
  </>,
);
export const List = svg(<path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" />);
export const Download = svg(
  <>
    <path d="M12 4v11" />
    <path d="M8 11.4 12 15.5l4-4.1" />
    <path d="M5 19.5h14" />
  </>,
);
export const Chevron = svg(<path d="M9 5.5 16 12l-7 6.5" />);
export const Calendar = svg(
  <>
    <rect x="3.8" y="5" width="16.4" height="15" rx="2" />
    <path d="M3.8 9.8h16.4M8.5 3.5v3M15.5 3.5v3" />
  </>,
);
export const Signal = svg(
  <>
    <path d="M5 18.5v-4M10 18.5v-7M15 18.5v-10M20 18.5v-13" />
  </>,
);
export const Logout = svg(
  <>
    <path d="M15 4.5h3.4a1.6 1.6 0 0 1 1.6 1.6v11.8a1.6 1.6 0 0 1-1.6 1.6H15" />
    <path d="M10.5 8 6.5 12l4 4M6.5 12H15" />
  </>,
);
export const Copy = svg(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 6.2V5a1.6 1.6 0 0 0-1.6-1.6H5A1.6 1.6 0 0 0 3.4 5v8.4A1.6 1.6 0 0 0 5 15h1.2" />
  </>,
);

/** The brand mark: a dial with one arc filled and a tick hand. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.4" />
      <path
        d="M16 3a13 13 0 0 1 11.3 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M16 3a13 13 0 0 0-11.3 19.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />
      <circle cx="16" cy="16" r="2.6" fill="currentColor" />
      <path d="M16 16V9.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
