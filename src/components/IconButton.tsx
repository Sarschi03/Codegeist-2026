import type { ButtonHTMLAttributes, ReactNode } from 'react';
export function IconButton({label,children,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{label:string;children:ReactNode}) {
  return <button type="button" title={label} aria-label={label} className={'icon-button '+className} {...props}>{children}</button>;
}
