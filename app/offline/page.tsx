import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="error-screen app-shell">
      <div className="install-mark">日</div>
      <h1>现在处于离线状态</h1>
      <p>从主屏幕重新打开“每日评分”，已缓存的应用和本机记录仍可正常使用。</p>
      <Link className="button button-primary" href="/">
        返回今日打卡
      </Link>
    </main>
  );
}
