import type { SVGProps } from 'react';

export function ExtensionIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M7.5 4.27 12 2l4.5 2.27v4.46L12 11 7.5 8.73z" />
      <path d="M12 11v6" />
      <path d="M7.5 13.27 12 17l4.5-4.73" />
      <path d="M4 19.5 12 22l8-2.5" />
    </svg>
  );
}
