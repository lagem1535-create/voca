// 로그인이 필요한 페이지의 공통 시작 처리

import { requireUser, logout, displayName } from "./auth.js";
import { renderShell } from "./ui.js";

/**
 * 로그인을 확인하고(안 했으면 로그인 페이지로 이동) 공통 레이아웃을 그립니다.
 * @returns {Promise<{ user: any, main: HTMLElement }>}
 */
export async function setupPage({ active, title }) {
  const user = await requireUser();
  const main = renderShell({
    active,
    title,
    userName: displayName(user),
    userEmail: user.email || "",
    onLogout: logout,
  });
  return { user, main };
}
