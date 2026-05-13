/* ============================================================
   GitHub 公開リポジトリ自動読み込み
   ============================================================ */

const GH_CONFIG = {
  owner:         'P2-Lab-C2H4',
  ownerType:     'user',
  portalRepo:    'P2Lab-Developments', // Page_specified.txt を置くリポジトリ名
  portalBranch:  'main',       // そのリポジトリのブランチ
  cacheMinutes:  60,
  slideInterval: 6000,
  maxImages:     12,
  cacheVersion:  '2026-04-26-v2',
};

let _ghLastError = null;

{
  _detectGitHubPagesConfig();
  const params = new URLSearchParams(location.search);
  if (params.get('gh_owner')) GH_CONFIG.owner = params.get('gh_owner');
  if (params.get('gh_owner_type')) GH_CONFIG.ownerType = _normalizeOwnerType(params.get('gh_owner_type'));
  if (params.get('gh_repo')) GH_CONFIG.portalRepo = params.get('gh_repo');
  if (params.get('gh_branch')) GH_CONFIG.portalBranch = params.get('gh_branch');
  if (params.get('gh_refresh')) {
    Object.keys(localStorage)
      .filter(key => key.startsWith('gh_apps_'))
      .forEach(key => localStorage.removeItem(key));
  }
}

function _detectGitHubPagesConfig() {
  const host = location.hostname;
  const githubPagesSuffix = '.github.io';
  if (!host.toLowerCase().endsWith(githubPagesSuffix)) return;

  const owner = host.slice(0, -githubPagesSuffix.length);
  const pathParts = location.pathname.split('/').filter(Boolean);
  GH_CONFIG.owner = owner;
  GH_CONFIG.portalRepo = pathParts[0] || owner + '.github.io';
}

function _ghHeaders() {
  const headers = { Accept: 'application/vnd.github+json' };
  const token = localStorage.getItem('gh_token');
  if (token) headers.Authorization = 'Bearer ' + token;
  return headers;
}

async function _ghFetch(url) {
  try {
    const response = await fetch(url, { headers: _ghHeaders() });
    if (!response.ok) {
      _ghLastError = {
        url,
        status: response.status,
        remaining: response.headers.get('x-ratelimit-remaining'),
        reset: response.headers.get('x-ratelimit-reset'),
      };
      return null;
    }
    return response.json();
  } catch (error) {
    _ghLastError = { url, status: 0, message: error?.message || 'fetch failed' };
    return null;
  }
}

async function _ghText(owner, repo, path, ref) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url =
    'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + encodedPath + '?ref=' + encodeURIComponent(ref);
  const data = await _ghFetch(url);
  if (!data || Array.isArray(data) || typeof data.content !== 'string') return null;

  try {
    const content = data.content.replace(/\n/g, '');
    return decodeURIComponent(escape(atob(content)));
  } catch {
    return null;
  }
}

async function _sameSiteText(path) {
  try {
    const url = new URL(path, location.href);
    url.searchParams.set('v', Date.now().toString());
    const response = await fetch(url.href, { cache: 'no-store' });
    if (!response.ok) return null;
    return response.text();
  } catch {
    return null;
  }
}

async function _ghDir(owner, repo, path, ref) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url =
    'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + encodedPath + '?ref=' + encodeURIComponent(ref);
  const data = await _ghFetch(url);
  return Array.isArray(data) ? data : null;
}

async function _findRepoIco(owner, repo, branch) {
  if (!owner || !repo) return null;

  for (const path of ['DLpage_info', '']) {
    const entries = await _ghDir(owner, repo, path, branch || 'main');
    if (!entries) continue;
    const icoFiles = entries.filter(e => e.type === 'file' && /\.ico$/i.test(e.name));
    if (!icoFiles.length) continue;
    const preferred =
      icoFiles.find(e => e.name.toLowerCase() === 'favicon.ico') || icoFiles[0];
    return preferred.download_url || null;
  }

  return null;
}

async function _findSameSiteIco() {
  try {
    const url = new URL('favicon.ico', location.href);
    url.searchParams.set('v', Date.now().toString());
    const response = await fetch(url.href, { method: 'HEAD', cache: 'no-store' });
    return response.ok ? url.href : null;
  } catch {
    return null;
  }
}

function _parseLines(text) {
  return (text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

const _SECTION_LINE_RE = /^\s*(?:[◆■●▶▷◇□○★☆＊※→►◉✦✧]|[-=]{2,}|[【\[])(.+?)(?:[】\]]|\s*)$/;

function _normalizeSectionName(value) {
  return value
    .replace(/^[◆■●▶▷◇□○★☆＊※→►◉✦✧【\[]+/, '')
    .replace(/[】\]：:]+$/, '')
    .trim();
}

function _parseSections(text) {
  const sections = {};
  let currentKey = null;

  for (const rawLine of (text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const matched = line.match(_SECTION_LINE_RE);
    if (matched) {
      currentKey = _normalizeSectionName(matched[1]);
      if (currentKey) sections[currentKey] = [];
      continue;
    }

    if (currentKey) {
      sections[currentKey].push(line);
    }
  }

  return sections;
}

function _getSectionLines(sections, keys) {
  for (const key of keys) {
    if (sections[key] && sections[key].length) {
      return sections[key];
    }
  }
  return [];
}

function _parseAppInfo(infoText) {
  const mergedSections = _parseSections(infoText);

  const name = _getSectionLines(mergedSections, ['表示アプリ名', 'アプリ名', '名前', 'Name'])[0] || '';
  const category = _getSectionLines(mergedSections, ['カテゴリ', 'Category', '分類'])[0] || 'アプリ';
  const featureLines = _getSectionLines(mergedSections, ['主な機能', '機能', 'Features'])
    .map(line => line.replace(/^[・\-*•\d.]+\s*/, '').trim())
    .filter(Boolean);
  const requirements = _getSectionLines(mergedSections, ['動作環境', '環境', 'Requirements']).join(' / ');
  const language     = _getSectionLines(mergedSections, ['作成言語', '開発言語', '使用言語', 'Language']).join(' / ');
  const summaryLines = _getSectionLines(mergedSections, ['概要', 'About', 'Overview', '説明']);
  const overviewLines = _getSectionLines(mergedSections, ['Overview', '補足', '詳細']);

  return {
    appName: name.trim(),
    category: category.trim(),
    summary: summaryLines.join('\n'),
    shortDescription: (summaryLines[0] || '').trim(),
    features: featureLines,
    requirements: requirements.trim() || '-',
    language: language.trim() || '-',
    overview: overviewLines.join('\n').trim(),
  };
}

function _sortCardImages(entries) {
  return entries
    .filter(entry => /^Card_image\d+\.(png|jpg|jpeg|webp|gif)$/i.test(entry.name))
    .sort((a, b) => {
      const aNum = Number((a.name.match(/\d+/) || ['0'])[0]);
      const bNum = Number((b.name.match(/\d+/) || ['0'])[0]);
      return aNum - bNum;
    })
    .map(entry => entry.download_url)
    .filter(Boolean);
}

async function _readCardImageRefs(owner, repo, branch, entries) {
  const refFiles = entries
    .filter(entry => /^Card_image\d+\.txt$/i.test(entry.name))
    .sort((a, b) => {
      const aNum = Number((a.name.match(/\d+/) || ['0'])[0]);
      const bNum = Number((b.name.match(/\d+/) || ['0'])[0]);
      return aNum - bNum;
    });

  const images = [];
  for (const entry of refFiles) {
    const text = await _ghText(owner, repo, 'DLpage_info/' + entry.name, branch);
    const value = (text || '').trim();
    if (!value) continue;

    if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) {
      images.push(value);
      continue;
    }

    const normalized = value.replace(/^\.?\//, '');
    images.push(
      'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/' + normalized
    );
  }

  return images;
}

async function _fetchRelease(owner, repo) {
  const latest = await _ghFetch('https://api.github.com/repos/' + owner + '/' + repo + '/releases/latest');
  if (!latest) return null;

  return {
    version: latest.tag_name || '',
    publishedAt: (latest.published_at || latest.created_at || '').slice(0, 10),
    pageUrl: latest.html_url || '',
    zipUrl: latest.zipball_url || '',
    assets: Array.isArray(latest.assets)
      ? latest.assets.map(asset => ({
          name: asset.name,
          url: asset.browser_download_url,
        }))
      : [],
  };
}

async function _fetchAllRepos() {
  const base =
    GH_CONFIG.ownerType === 'org'
      ? 'https://api.github.com/orgs/' + GH_CONFIG.owner + '/repos'
      : 'https://api.github.com/users/' + GH_CONFIG.owner + '/repos';

  const repos = [];
  let page = 1;

  while (true) {
    const data = await _ghFetch(base + '?per_page=100&page=' + page + '&sort=updated&type=public');
    if (!data && page === 1) return null;
    if (!data || !data.length) break;
    repos.push(...data);
    if (data.length < 100) break;
    page += 1;
  }

  // フォーク・アーカイブ・非公開に加え、ポータルリポジトリ自身も除外
  const portalRepo = GH_CONFIG.portalRepo || '';
  return repos.filter(repo =>
    repo && !repo.fork && !repo.archived && !repo.private &&
    (!portalRepo || repo.name !== portalRepo)
  );
}

async function _repoToApp(repo) {
  const owner = GH_CONFIG.owner;
  const branch = repo.default_branch || 'main';
  const infoEntries = await _ghDir(owner, repo.name, 'DLpage_info', branch);
  if (!infoEntries || !infoEntries.length) return null;

  const names = new Set(infoEntries.map(entry => entry.name.toLowerCase()));
  const hasInfoFile = names.has('application_info.txt');
  if (!hasInfoFile) return null;

  const [infoText, release] = await Promise.all([
    _ghText(owner, repo.name, 'DLpage_info/application_info.txt', branch),
    _fetchRelease(owner, repo.name),
  ]);

  const parsed = _parseAppInfo(infoText);
  const inlineImages = _sortCardImages(infoEntries);
  const referencedImages = await _readCardImageRefs(owner, repo.name, branch, infoEntries);
  const images = [...referencedImages, ...inlineImages].slice(0, GH_CONFIG.maxImages);

  // .ico ファイルをアイコンとして使用
  // DLpage_info/ 内を優先確認、なければリポジトリルートを確認
  let iconImage = null;
  const icoInInfo = infoEntries.find(e => e.type === 'file' && /\.ico$/i.test(e.name));
  if (icoInInfo) {
    iconImage = icoInInfo.download_url;
  } else {
    const rootEntries = await _ghDir(owner, repo.name, '', branch);
    if (rootEntries) {
      const icoInRoot = rootEntries.find(e => e.type === 'file' && /\.ico$/i.test(e.name));
      if (icoInRoot) iconImage = icoInRoot.download_url;
    }
  }

  // About欄の "//" を改行として扱う (Aboutは1行制限のため改行代替記法)
  const repoAbout = (repo.description || '').trim().replace(/\s*\/\/\s*/g, '\n');
  const summary = parsed.summary || repoAbout || '概要は未設定です。';
  const shortDescription = parsed.shortDescription || (repo.description || '').trim().split('//')[0].trim() || '詳細情報を参照してください。';
  const version = (release?.version || '').replace(/^v/i, '') || '-';
  const lastUpdated = release?.publishedAt || (repo.updated_at || '').slice(0, 10) || '-';

  // ダウンロードボタンの組み立て (GitHubリポジトリを開くは最後に1つだけ)
  const downloads = [];
  if (release?.assets?.[0]?.url) {
    downloads.push({
      label:   '最新版をダウンロード (' + release.version + ')',
      url:     release.assets[0].url,
      primary: true,
    });
    release.assets.slice(1).forEach(asset => {
      downloads.push({ label: asset.name, url: asset.url, primary: false });
    });
  } else if (release?.pageUrl) {
    downloads.push({
      label:   'リリースページを開く (' + release.version + ')',
      url:     release.pageUrl,
      primary: true,
    });
  }
  // GitHubリポジトリへのリンクを重複なしで末尾に追加
  if (!downloads.some(d => d.url === repo.html_url)) {
    downloads.push({
      label:   'GitHubリポジトリを開く',
      url:     repo.html_url,
      primary: downloads.length === 0, // 他にボタンがなければ primary にする
    });
  }

  return {
    id: repo.name,
    name: parsed.appName || repo.name,
    shortDescription,
    description: parsed.overview ? summary + '\n\n' + parsed.overview : summary,
    icon:       '📦',
    iconColor:  '#2B78D3',
    iconImage,
    category: parsed.category || 'アプリ',
    version,
    lastUpdated,
    requirements: parsed.requirements,
    language: parsed.language,
    features: parsed.features,
    downloads,
    images,
    repoUrl: repo.html_url,
    about: repoAbout,
    releaseTag: release?.version || '',
    _source: 'github',
  };
}

window.GH_loadApps = async function () {
  if (!GH_CONFIG.owner) return [];

  const cacheKey = 'gh_apps_' + GH_CONFIG.owner + '_' + GH_CONFIG.ownerType + '_' + GH_CONFIG.cacheVersion;
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() - cached.ts < GH_CONFIG.cacheMinutes * 60 * 1000) {
      return cached.apps || [];
    }
  } catch {
    // ignore cache parse error
  }

  const repos = await _fetchAllRepos();
  if (!repos) {
    if (cached?.apps?.length) return cached.apps;
    return [];
  }
  const results = [];
  const concurrency = 4;

  for (let i = 0; i < repos.length; i += concurrency) {
    const batch = repos.slice(i, i + concurrency);
    const apps = await Promise.all(batch.map(repo => _repoToApp(repo).catch(() => null)));
    results.push(...apps.filter(Boolean));
  }

  results.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), apps: results }));
  } catch {
    // ignore cache write error
  }

  return results;
};

window.GH_getLastError = function () {
  return _ghLastError;
};

const _slideTimers = new Map();

function _initSlide(cardEl) {
  const track = cardEl.querySelector('.card-images-track');
  if (!track) return;

  const slides = Array.from(track.querySelectorAll('.card-slide-img'));
  if (slides.length <= 1) return;

  const dots = Array.from(cardEl.querySelectorAll('.slide-dot'));
  let current = 0;

  function goTo(index) {
    current = (index + slides.length) % slides.length;
    track.style.transform = 'translateX(-' + current * 100 + '%)';
    dots.forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === current));
  }

  const timerId = cardEl.dataset.id || String(Math.random());
  if (_slideTimers.has(timerId)) clearInterval(_slideTimers.get(timerId));
  _slideTimers.set(timerId, setInterval(() => goTo(current + 1), GH_CONFIG.slideInterval));
}

window.GH_initSlides = function () {
  document.querySelectorAll('.app-card').forEach(_initSlide);
};

/* ============================================================
   リポジトリ内アセットの URL 解決ヘルパー
   ============================================================ */
function _resolveAsset(owner, repo, branch, value) {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return (
    'https://raw.githubusercontent.com/' +
    owner + '/' + repo + '/' + branch + '/' +
    v.replace(/^\.?\//, '')
  );
}

function _resolveSameSiteAsset(value) {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  try {
    return new URL(v.replace(/^\.?\//, ''), location.href).href;
  } catch {
    return null;
  }
}

function _applyPageConfigToGhConfig(cfg) {
  if (!cfg) return;
  if (cfg.githubOwner) GH_CONFIG.owner = cfg.githubOwner;
  if (cfg.githubOwnerType) GH_CONFIG.ownerType = _normalizeOwnerType(cfg.githubOwnerType);
  if (cfg.githubPortalRepo) GH_CONFIG.portalRepo = cfg.githubPortalRepo;
  if (cfg.githubBranch) GH_CONFIG.portalBranch = cfg.githubBranch;
}

function _normalizeOwnerType(value) {
  const v = (value || '').trim().toLowerCase();
  return v === 'org' || v === 'organization' || v === 'organisation' ? 'org' : 'user';
}

function _parsePageConfig(text, assetResolver) {
  if (!text) return null;

  const sections = _parseSections(text);
  const get = (...keys) => _getSectionLines(sections, keys);
  const asset = v => assetResolver(v);

  const heroColors = get('ヘッダー色', 'ヘッダー背景色', 'hero_color');
  const heroTextBgEnabled = get('ヘッダー文字背景', '文字背景', 'hero_text_bg')[0] || null;
  const rawSiteIcon = get('サイトアイコン', 'ブランドアイコン', 'site_icon')[0] || null;
  const siteIconImageValue = get('サイトアイコン画像', 'サイトアイコンファイル', 'favicon', 'site_icon_image')[0] ||
    (/\.(?:ico|png|jpe?g|gif|webp|svg)(?:\?.*)?$/i.test(rawSiteIcon || '') ? rawSiteIcon : null);

  return {
    // GitHub 取得元
    githubOwner:      get('GitHubアカウント', 'GitHubオーナー', 'github_owner', 'gh_owner')[0] || null,
    githubOwnerType:  get('GitHub種別', 'GitHubオーナー種別', 'github_owner_type', 'gh_owner_type')[0] || null,
    githubPortalRepo: get('GitHub Pagesリポジトリ', 'ポータルリポジトリ', 'github_portal_repo', 'gh_repo')[0] || null,
    githubBranch:     get('GitHubブランチ', 'ポータルブランチ', 'github_branch', 'gh_branch')[0] || null,

    // ナビゲーションバー
    siteTitle:      get('サイト名',       'ブランド名',       'site_title')[0]    || null,
    siteIcon:       siteIconImageValue === rawSiteIcon ? null : rawSiteIcon,
    siteIconImage:  asset(siteIconImageValue),
    accentColor:    get('アクセントカラー','ボタン色',        'accent_color')[0]  || null,
    navColor:       get('ナビ色',         'ナビゲーション色', 'nav_color')[0]     || null,

    // ヒーローエリア
    heroColor1:     heroColors[0] || null,
    heroColor2:     heroColors[1] || null,
    heroImage:      asset(get('ヘッダー画像', 'hero_image')[0]),
    heroTitle:      get('ヘッダー文字タイトル', 'タイトル',     'hero_title')[0]  || null,
    heroTitleColor: get('ヘッダー文字色',       'タイトル色',   'hero_title_color')[0] || null,
    heroDesc:       get('ヘッダー文字説明',     '説明文',       'hero_desc')[0]   || null,
    heroDescColor:  get('ヘッダー文字説明色',   '説明文色',     'hero_desc_color')[0]  || null,
    heroTextBg:     heroTextBgEnabled,
    heroTextBgColor: get('ヘッダー文字背景色', '文字背景色', 'hero_text_bg_color')[0] || null,
    heroTextBgOpacity: get('ヘッダー文字背景透過度', '文字背景透過度', 'hero_text_bg_opacity')[0] || null,

    // ページ背景
    bgColor:        get('背景色', 'background_color', 'bg_color')[0] || null,
    bgImage:        asset(get('背景画像', 'background_image', 'bg_image')[0]),
  };
}

/* ============================================================
   ページ外観設定ファイル (Page_specified.txt) の取得と解析
   ============================================================
   【Page_specified.txt で指定できる項目】

   ◆ サイト名               ← 左上ブランド名 (例: アプリ配布ポータル)
   ◆ サイトアイコン         ← 左上アイコン絵文字 (例: ⚙)
   ◆ サイトアイコン画像     ← 左上アイコン画像 / favicon (例: favicon.ico)
   ◆ アクセントカラー       ← ボタン・リンク色 (例: #0071E3)
   ◆ ナビ色                 ← 上部ナビバー背景色 (例: #1A1A2E)

   ◆ ヘッダー色             ← ヒーロー背景色 (1行=単色 / 2行=グラデーション)
   ◆ ヘッダー画像           ← ヒーロー背景画像 (URL or リポジトリ内パス)
                               推奨サイズ: 1920×220px (比率 約8.7:1)
   ◆ ヘッダー文字タイトル   ← ヒーローの大見出し
   ◆ ヘッダー文字色         ← 大見出しの文字色
   ◆ ヘッダー文字説明       ← ヒーローのサブ説明文
   ◆ ヘッダー文字説明色     ← サブ説明文の文字色
   ◆ ヘッダー文字背景       ← 文字背景の有無 (あり / なし)
   ◆ ヘッダー文字背景色     ← 文字背景の色 (例: #16161A)
   ◆ ヘッダー文字背景透過度 ← 文字背景の透過度 (0〜1)

   ◆ 背景色                 ← ページ背景色
   ◆ 背景画像               ← ページ背景画像 (タイル繰り返し / 推奨: 400×400px)
   ============================================================ */
window.GH_loadPageConfig = async function () {
  const sameSiteText = await _sameSiteText('Page_specified.txt');
  if (sameSiteText) {
    const cfg = _parsePageConfig(sameSiteText, _resolveSameSiteAsset);
    _applyPageConfigToGhConfig(cfg);
    if (!cfg.siteIconImage) {
      cfg.siteIconImage =
        (await _findRepoIco(GH_CONFIG.owner, GH_CONFIG.portalRepo, GH_CONFIG.portalBranch)) ||
        (await _findSameSiteIco());
    }
    return cfg;
  }

  const owner  = GH_CONFIG.owner;
  const repo   = GH_CONFIG.portalRepo;
  const branch = GH_CONFIG.portalBranch || 'main';
  if (!owner || !repo) return null;

  // main → master の順にフォールバック
  const text =
    (await _ghText(owner, repo, 'Page_specified.txt', branch)) ||
    (await _ghText(owner, repo, 'Page_specified.txt', 'master'));
  if (!text) return null;

  const asset = v => _resolveAsset(owner, repo, branch, v);
  const cfg = _parsePageConfig(text, asset);
  _applyPageConfigToGhConfig(cfg);
  if (!cfg.siteIconImage) cfg.siteIconImage = await _findRepoIco(owner, repo, branch);
  return cfg;
};
