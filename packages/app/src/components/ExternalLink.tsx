// 바깥 링크. 누르면 openExternal 로 연다 (데스크톱은 기본 브라우저, 브라우저는 새 탭). href 는 주소 복사와 접근성용이다.

import type { ReactNode } from "react";
import { defaultOpenDeps, openLink, type OpenExternalDeps, type OpenLinkHost } from "../editor/openExternal";

export function ExternalLink({ host, href, children, testId, deps = defaultOpenDeps }: { host: OpenLinkHost; href: string; children: ReactNode; testId?: string; deps?: OpenExternalDeps }) {
  return (
    <a
      href={href}
      rel="noreferrer"
      data-testid={testId}
      data-external="true"
      onClick={(e) => {
        e.preventDefault();
        void openLink(host, href, deps);
      }}
    >
      {children}
    </a>
  );
}
