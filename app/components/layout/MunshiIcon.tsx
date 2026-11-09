import type { SVGProps } from "react";

/** Munshi Desk mark: a pouch with ledger lines. Same art as public/favicon.svg. */
export function MunshiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" {...props}>
      <rect width="64" height="64" rx="14" fill="#C2410C" />
      <path
        d="M19 12h26a3 3 0 0 1 3 3v32a7 7 0 0 1-7 7H23a7 7 0 0 1-7-7V15a3 3 0 0 1 3-3z"
        fill="#FFF7ED"
      />
      <rect x="16" y="20" width="32" height="3.5" fill="#C2410C" />
      <rect x="22" y="30" width="20" height="3.5" rx="1.75" fill="#FB923C" />
      <rect x="22" y="37" width="20" height="3.5" rx="1.75" fill="#FB923C" />
      <rect x="22" y="44" width="12" height="3.5" rx="1.75" fill="#FB923C" />
    </svg>
  );
}
