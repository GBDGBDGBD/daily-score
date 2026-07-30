"use client";

interface InstallGuideProps {
  onPreview: () => void;
}

export function InstallGuide({ onPreview }: InstallGuideProps) {
  return (
    <main className="install-guide app-shell">
      <div className="install-mark" aria-hidden="true">
        日
      </div>
      <p className="eyebrow">每日评分 · iPhone</p>
      <h1>先添加到主屏幕，再开始正式打卡</h1>
      <p className="install-lead">
        主屏幕版本拥有独立的本地数据空间。这样能让你的记录离线可用，也避免在
        Safari 里先填写的数据无法跟随安装。
      </p>
      <ol className="install-steps">
        <li>
          <span>1</span>
          用 Safari 打开此页面
        </li>
        <li>
          <span>2</span>
          点击底部“分享”按钮
        </li>
        <li>
          <span>3</span>
          选择“添加到主屏幕”
        </li>
        <li>
          <span>4</span>
          从桌面图标重新打开
        </li>
      </ol>
      <div className="privacy-note">
        <span aria-hidden="true">⌁</span>
        <div>
          <strong>数据只留在这台 iPhone</strong>
          <p>不注册、不上传；请定期备份到 iCloud Drive。</p>
        </div>
      </div>
      <button className="button button-primary button-wide" type="button" onClick={onPreview}>
        先浏览应用
      </button>
      <p className="install-footnote">浏览模式也会使用当前 Safari 的本地存储。</p>
    </main>
  );
}
