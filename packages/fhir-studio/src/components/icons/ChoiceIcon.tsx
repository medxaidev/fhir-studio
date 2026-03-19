import type { SVGProps } from 'react';

export function ChoiceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M16 3h5v5" />
      <path d="M8 3H3v5" />
      <path d="m21 3-8.5 8.5" />
      <path d="M3 3l8.5 8.5" />
      <path d="M12 12v9" />
    </svg>
  );
}
