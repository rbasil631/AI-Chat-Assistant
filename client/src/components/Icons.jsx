const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const PlusIcon = (p) => <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>;
export const SendIcon = (p) => <svg {...base} {...p}><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
export const StopIcon = (p) => <svg {...base} {...p}><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" /></svg>;
export const SearchIcon = (p) => <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></svg>;
export const PencilIcon = (p) => <svg {...base} width={16} height={16} {...p}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /></svg>;
export const TrashIcon = (p) => <svg {...base} width={16} height={16} {...p}><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg>;
export const RetryIcon = (p) => <svg {...base} width={16} height={16} {...p}><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" /></svg>;
export const CopyIcon = (p) => <svg {...base} width={16} height={16} {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>;
export const MenuIcon = (p) => <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h10" /></svg>;
export const CloseIcon = (p) => <svg {...base} {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>;
export const ArrowDownIcon = (p) => <svg {...base} {...p}><path d="M12 5v14M6 13l6 6 6-6" /></svg>;
