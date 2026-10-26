const base = {
  width: 17,
  height: 17,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const make = (paths) =>
  function Icon(props) {
    return (
      <svg {...base} {...props}>
        {paths}
      </svg>
    );
  };

export const IconHome = make(
  <>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </>
);

export const IconBook = make(
  <>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v18H5.5A1.5 1.5 0 0 1 4 19.5z" />
    <path d="M8 3v18" />
  </>
);

export const IconFlask = make(
  <>
    <path d="M9.5 3v6.2L4.6 17.6A2 2 0 0 0 6.3 20.7h11.4a2 2 0 0 0 1.7-3.1L14.5 9.2V3" />
    <path d="M8.5 3h7" />
    <path d="M7.2 14h9.6" />
  </>
);

export const IconSearch = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>
);

export const IconTerminal = make(
  <>
    <path d="m5 7 4 4-4 4" />
    <path d="M12 16h7" />
  </>
);

export const IconPlay = make(<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />);

export const IconCopy = make(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15" />
  </>
);

export const IconCheck = make(<path d="m4.5 12.5 5 5 10-11" />);

export const IconStar = make(
  <path d="m12 3.5 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9z" />
);

export const IconEdit = make(
  <>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
    <path d="M14 5.5 18.5 10" />
  </>
);

export const IconEye = make(
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12" />
    <circle cx="12" cy="12" r="3" />
  </>
);

export const IconPlus = make(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>
);

export const IconChevron = make(<path d="m9 5 7 7-7 7" />);

export const IconSpark = make(
  <>
    <path d="M12 3.5 13.9 9l5.6 2-5.6 2-1.9 5.5L10.1 13l-5.6-2 5.6-2z" />
    <path d="M18.5 4v3M20 5.5h-3" />
  </>
);

export const IconFlame = make(
  <path d="M12 3s5 4.2 5 8.6A5 5 0 0 1 12 17a5 5 0 0 1-5-5.4C7 9.4 8.6 8 8.6 8s.4 2 1.9 2.6C10.5 8 12 6 12 3" />
);

export const IconSave = make(
  <>
    <path d="M5 3h11l3 3v15H5z" />
    <path d="M8 3v6h7V3M8 21v-6h8v6" />
  </>
);

export const IconClose = make(
  <>
    <path d="M6 6 18 18" />
    <path d="M18 6 6 18" />
  </>
);

export const IconSun = make(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>
);

export const IconMoon = make(<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5" />);

export const IconLayout = make(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M15 4v16" />
  </>
);

export const IconExpand = make(
  <>
    <path d="M4 12h16" />
    <path d="m8 8-4 4 4 4" />
    <path d="m16 8 4 4-4 4" />
  </>
);

export const IconCollapse = make(
  <>
    <path d="M3 12h7M14 12h7" />
    <path d="m7 8 3 4-3 4" />
    <path d="m17 8-3 4 3 4" />
  </>
);

export const IconSidebar = make(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
    <path d="M5.4 8.5h2.2M5.4 12h2.2M5.4 15.5h2.2" strokeWidth="1.5" />
  </>
);

export const IconRefresh = make(
  <>
    <path d="M20 11a8 8 0 0 0-14-4.5L4 9" />
    <path d="M4 5v4h4" />
    <path d="M4 13a8 8 0 0 0 14 4.5L20 15" />
    <path d="M20 19v-4h-4" />
  </>
);

export const IconList = make(
  <>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </>
);

export const IconClock = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.2 2" />
  </>
);

export const IconQuiz = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.9" />
    <path d="M12 16.8h.01" />
  </>
);

export const IconFlag = make(
  <>
    <path d="M5 21V4" />
    <path d="M5 4.5h12l-2.2 4 2.2 4H5" />
  </>
);

export const IconArrowLeft = make(
  <>
    <path d="M19 12H5" />
    <path d="m11 6-6 6 6 6" />
  </>
);

export const IconArrowRight = make(
  <>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </>
);

export const IconHelp = IconQuiz;

export const IconFocus = make(
  <>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" />
    <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" />
    <path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
    <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
  </>
);
