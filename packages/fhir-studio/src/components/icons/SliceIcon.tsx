import type { SVGProps } from 'react';

export function SliceIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M4 20h16" />
      <path d="M4 14h16" />
      <path d="M4 8h16" />
      <path d="M8 4v16" />
    </svg>
  );
}
