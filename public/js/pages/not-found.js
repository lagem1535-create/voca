// 없는 경로
import { h, emptyState } from "../ui.js";

export default function mount(root) {
  root.append(emptyState("페이지를 찾을 수 없어요", `${location.pathname} 은(는) 없는 주소예요.`, h("a", { class: "btn primary", href: "/" }, "홈으로")));
}
