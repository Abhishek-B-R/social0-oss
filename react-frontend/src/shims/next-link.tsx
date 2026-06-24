import {
  Link as RouterLink,
  type LinkProps as RouterLinkProps,
} from "react-router-dom";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type NextLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children?: ReactNode;
  prefetch?: boolean;
};

export default function Link({
  href,
  children,
  prefetch: _prefetch,
  ...rest
}: NextLinkProps) {
  if (href.startsWith("http")) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <RouterLink to={href} {...(rest as Omit<RouterLinkProps, "to">)}>
      {children}
    </RouterLink>
  );
}
