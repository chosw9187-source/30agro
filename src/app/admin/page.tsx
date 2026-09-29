import { redirect } from "next/navigation";

/**
 * `/admin`만 치고 들어온 관리자를 어디로 보내는가.
 *
 * 예전에는 구 평가 모듈의 첫 화면(`/admin/evaluation`)으로 보냈다. 인사평가를
 * 그 한 벌로 굴리던 시절의 자리인데, 이제 인사평가는 「인사평가」 화면 한 곳에서
 * 굴러가고 구 평가 모듈은 왼쪽 띠에서 걷었다. 관리자가 `/admin`에서 옛 화면을
 * 만나면 «지금 쓰는 곳»을 다시 찾아 나서야 한다.
 */
export default function AdminIndexPage() {
  redirect("/platform/evaluation2");
}
