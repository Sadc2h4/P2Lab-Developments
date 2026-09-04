/* ============================================================
   Portal 共通描画モジュール
   - index.html (公開ページ) と card_editor.html (編集ツール) が
     同じ関数でカード / 詳細モーダルを描画する。
   - ここを変えると両方の見た目が変わる。
   ============================================================ */
(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* 静的データ (apps.js) の 1 件を表示用に正規化する */
  function normalize(app, i) {
    app = app || {};
    return {
      id:               app.id            || 'app-' + i,
      name:             app.name          || '(無題)',
      shortDescription: app.shortDescription || app.description || '',
      description:      app.description      || app.shortDescription || '',
      icon:             app.icon             || '📦',
      iconColor:        app.iconColor        || '#607D8B',
      iconImage:        app.iconImage        || null,
      category:         app.category         || 'その他',
      version:          app.version          || '-',
      lastUpdated:      app.lastUpdated      || '-',
      requirements:     app.requirements     || '-',
      language:         app.language         || '-',
      features:         Array.isArray(app.features) ? app.features : [],
      images:           Array.isArray(app.images) ? app.images : [],
      downloads:        Array.isArray(app.downloads) && app.downloads.length
                          ? app.downloads
                          : [{ label: app.url ? 'ダウンロード / 開く' : 'リンク未設定',
                               url: app.url || '#', primary: true }],
    };
  }

  /* リンク先は http(s) のみ許可 (javascript: などは無効化) */
  function safeHref(raw) {
    const v = String(raw ?? '').trim();
    if (!v || v === '#') return '#';
    try {
      const url = new URL(v, document.baseURI);
      return /^https?:$/.test(url.protocol) ? url.href : '#';
    } catch {
      return '#';
    }
  }

  /* 画像パスを表示用 URL に変換するフック (エディタが Object URL に差し替える) */
  let resolveImage = src => src;
  function setImageResolver(fn) { resolveImage = typeof fn === 'function' ? fn : (s => s); }

  function iconHTML(app, large) {
    const size     = large ? 88 : 64;
    const fontSize = large ? 40 : 28;
    const cls      = large ? 'modal-icon' : 'app-icon';
    if (app.iconImage) {
      return `<img src="${escapeHtml(resolveImage(app.iconImage))}" alt="" class="${cls}"
                style="width:${size}px;height:${size}px;object-fit:contain;background:transparent;">`;
    }
    return `<div class="${cls}"
      style="background:${escapeHtml(app.iconColor)};width:${size}px;height:${size}px;font-size:${fontSize}px;">
      ${escapeHtml(app.icon)}
    </div>`;
  }

  const DL_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
        <path d="M12 5v14M5 12l7 7 7-7"/>
      </svg>`;

  function cardHTML(app) {
    const dl     = app.downloads[0] || { url: '#', label: 'リンク未設定' };
    const images = app.images || [];

    let imagesHTML = '';
    if (images.length > 0) {
      // カードは1枚目のみ静的表示 (スライドはモーダルのみ)
      imagesHTML = `<div class="card-images-wrap">
      <img class="card-single-img" src="${escapeHtml(resolveImage(images[0]))}" alt="" loading="lazy">
    </div>`;
    }

    return `
<article class="app-card${images.length ? ' has-images' : ''}" data-id="${escapeHtml(app.id)}"
         role="button" tabindex="0" aria-label="${escapeHtml(app.name)} の詳細を見る">
  ${imagesHTML}
  <div class="card-header">
    ${iconHTML(app)}
    <div class="card-meta">
      <span class="app-category">${escapeHtml(app.category)}</span>
      <div class="app-name">${escapeHtml(app.name)}</div>
      <div class="app-version">v${escapeHtml(app.version)} &nbsp;·&nbsp; ${escapeHtml(app.lastUpdated)}</div>
    </div>
  </div>
  <p class="app-short-desc">${escapeHtml(app.shortDescription)}</p>
  <div class="card-footer">
    <button class="btn btn-detail">詳細を見る</button>
    <a class="btn btn-primary dl-btn" href="${escapeHtml(safeHref(dl.url))}" target="_blank"
       rel="noopener" aria-label="${escapeHtml(app.name)} をダウンロード"
       onclick="event.stopPropagation()">
      ${DL_ICON}
      DL
    </a>
  </div>
</article>`;
  }

  /* モーダル上部の画像スライド領域 (画像がなければ空文字) */
  function modalImagesHTML(images) {
    images = images || [];
    if (!images.length) return '';
    const slides = images.map((src, i) =>
      `<img class="modal-slide-img" src="${escapeHtml(resolveImage(src))}" alt="" loading="lazy"
            role="button" tabindex="0" data-image-index="${i}" aria-label="画像を拡大表示">`
    ).join('');
    const dots = images.length > 1
      ? `<div class="slide-dots modal-slide-dots">${images.map((_, i) =>
          `<button class="slide-dot${i === 0 ? ' active' : ''}" type="button"
                   data-slide-index="${i}" aria-label="${i + 1}枚目の画像を表示"
                   aria-current="${i === 0 ? 'true' : 'false'}"></button>`
        ).join('')}</div>`
      : '';
    return `<div class="modal-images-wrap">
      <div class="modal-images-track">${slides}</div>
      ${dots}
    </div>`;
  }

  /* モーダル本文 */
  function modalBodyHTML(app) {
    const features = app.features.map(f => `<li>${escapeHtml(f)}</li>`).join('');

    const downloads = (app.downloads || []).map(d => `
    <a href="${escapeHtml(safeHref(d.url))}" target="_blank" rel="noopener"
       class="download-btn ${d.primary ? 'dl-primary' : 'dl-secondary'}">
      ${d.primary
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round">
             <path d="M12 5v14M5 12l7 7 7-7"/>
           </svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
           </svg>`}
      ${escapeHtml(d.label)}
    </a>`).join('');

    const descHTML = (app.description || '')
      .split('\n\n')
      .map(para => `<p class="modal-description">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
      .join('');

    return `
<div class="modal-app-header">
  ${iconHTML(app, true)}
  <div class="modal-app-info">
    <span class="modal-category-badge">${escapeHtml(app.category)}</span>
    <h2 class="modal-app-name">${escapeHtml(app.name)}</h2>
    <div class="modal-meta-row">
      <span class="meta-item">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/>
          <path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
        最終更新: ${escapeHtml(app.lastUpdated)}
      </span>
      <span class="meta-item">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
        v${escapeHtml(app.version)}
      </span>
    </div>
  </div>
</div>

<hr class="modal-divider">

<div class="modal-section">
  <div class="section-label">概要</div>
  ${descHTML || '<p class="modal-description">—</p>'}
</div>

<div class="modal-section">
  <div class="section-label">主な機能</div>
  <ul class="features-list">${features || '<li>—</li>'}</ul>
</div>

<div class="modal-two-col">
  <div class="modal-section">
    <div class="section-label">作成言語</div>
    <div class="requirements-box">${escapeHtml(app.language)}</div>
  </div>
  <div class="modal-section">
    <div class="section-label">動作環境</div>
    <div class="requirements-box">${escapeHtml(app.requirements)}</div>
  </div>
</div>

<hr class="modal-divider">

<div class="modal-section">
  <div class="section-label">ダウンロード</div>
  <div class="modal-downloads">${downloads}</div>
</div>`;
  }

  /* モーダル内スライドショーを初期化し、停止関数を返す */
  function initModalSlides(containerEl, options) {
    options = options || {};
    const interval = options.interval || 6000;
    const onImageClick = options.onImageClick || null;

    const track = containerEl.querySelector('.modal-images-track');
    if (!track) return () => {};

    const slides = Array.from(track.querySelectorAll('.modal-slide-img'));
    const dots   = Array.from(containerEl.querySelectorAll('.slide-dot'));
    let cur = 0;
    let timer = null;

    function restart() {
      clearInterval(timer);
      if (slides.length <= 1) return;
      timer = setInterval(() => goTo(cur + 1), interval);
    }

    function goTo(idx) {
      cur = (idx + slides.length) % slides.length;
      track.style.transform = 'translateX(-' + (cur * 100) + '%)';
      dots.forEach((d, i) => {
        const active = i === cur;
        d.classList.toggle('active', active);
        d.setAttribute('aria-current', active ? 'true' : 'false');
      });
      slides.forEach((slide, i) => { slide.tabIndex = i === cur ? 0 : -1; });
    }

    dots.forEach(dot => {
      dot.addEventListener('click', event => {
        event.stopPropagation();
        goTo(Number(dot.dataset.slideIndex || 0));
        restart();
      });
    });

    slides.forEach(slide => {
      slide.addEventListener('click', event => {
        event.stopPropagation();
        if (onImageClick) onImageClick(slide.src);
      });
      slide.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (onImageClick) onImageClick(slide.src);
      });
    });

    goTo(0);
    restart();
    return () => clearInterval(timer);
  }

  global.PortalRender = {
    escapeHtml,
    safeHref,
    normalize,
    setImageResolver,
    iconHTML,
    cardHTML,
    modalImagesHTML,
    modalBodyHTML,
    initModalSlides,
  };
})(window);
