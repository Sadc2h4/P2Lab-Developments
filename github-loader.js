/* ============================================================
   GitHub 公開リポジトリ自動読み込み
   ============================================================ */

const GH_CONFIG = {
  owner:         'Sangyoui-admin',
  ownerType:     'user',
  portalRepo:    'app-portal', // Page_specified.txt を置くリポジトリ名
  portalBranch:  'main',       // そのリポジトリのブランチ
  cacheMinutes:  5,
  slideInterval: 6000,
  maxImages:     12,
  cacheVersion:  '2026-04-24-v1',
};

{
  const params = new URLSearchParams(location.search);
  if (params.get('gh_owner')) GH_CONFIG.owner = params.get('gh_owner');
  if (params.get('gh_refresh')) {
    Object.keys(localStorage)
      .filter(key => key.startsWith('gh_apps_'))
      .forEach(key => localStorage.removeItem(key));
  }
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
    if (!response.ok) return null;
    return response.json();
  } catch {
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

async function _ghDir(owner, repo, path, ref) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url =
    'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + encodedPath + '?ref=' + encodeURIComponent(ref);
  const data = await _ghFetch(url);
  return Array.isArray(data) ? data : null;
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

function _parseAppInfo(infoText, overviewText) {
  const mergedSections = {
    ..._parseSections(infoText),
    ..._parseSections(overviewText),
  };

  const name = _getSectionLines(mergedSections, ['表示アプリ名', 'アプリ名', '名前', 'Name'])[0] || '';
  const category = _getSectionLines(mergedSections, ['カテゴリ', 'Category', '分類'])[0] || '社内アプリ';
  const featureLines = _getSectionLines(mergedSections, ['主な機能', '機能', 'Features'])
    .map(line => line.replace(/^[・\-*•\d.]+\s*/, '').trim())
    .filter(Boolean);
  const targetText = _getSectionLines(mergedSections, ['対象部署', '対象', '部署']).join('、');
  const targets = targetText
    ? targetText.split(/[,、，/／\n]+/).map(item => item.trim()).filter(Boolean)
    : [];
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
    targets,
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
    if (!data || !data.length) break;
    repos.push(...data);
    if (data.length < 100) break;
    page += 1;
  }

  return repos.filter(repo => repo && !repo.fork && !repo.archived && !repo.private);
}

async function _repoToApp(repo) {
  const owner = GH_CONFIG.owner;
  const branch = repo.default_branch || 'main';
  const infoEntries = await _ghDir(owner, repo.name, 'DLpage_info', branch);
  if (!infoEntries || !infoEntries.length) return null;

  const names = new Set(infoEntries.map(entry => entry.name.toLowerCase()));
  const hasInfoFile = names.has('application_info.txt') || names.has('overview.txt');
  if (!hasInfoFile) return null;

  const [infoText, overviewText, release] = await Promise.all([
    _ghText(owner, repo.name, 'DLpage_info/application_info.txt', branch),
    _ghText(owner, repo.name, 'DLpage_info/Overview.txt', branch),
    _fetchRelease(owner, repo.name),
  ]);

  const parsed = _parseAppInfo(infoText, overviewText);
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
    category: parsed.category || '社内アプリ',
    version,
    lastUpdated,
    targets: parsed.targets.length ? parsed.targets : ['全部署'],
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

  const cacheKey = 'gh_apps_' + GH_CONFIG.owner + '_' + GH_CONFIG.cacheVersion;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() - cached.ts < GH_CONFIG.cacheMinutes * 60 * 1000) {
      return cached.apps || [];
    }
  } catch {
    // ignore cache parse error
  }

  const repos = await _fetchAllRepos();
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

/* ============================================================
   ページ外観設定ファイル (Page_specified.txt) の取得と解析
   ============================================================
   【Page_specified.txt で指定できる項目】

   ◆ サイト名               ← 左上ブランド名 (例: 社内ツールポータル)
   ◆ サイトアイコン         ← 左上アイコン絵文字 (例: 🏢)
   ◆ アクセントカラー       ← ボタン・リンク色 (例: #0071E3)
   ◆ ナビ色                 ← 上部ナビバー背景色 (例: #1A1A2E)

   ◆ ヘッダー色             ← ヒーロー背景色 (1行=単色 / 2行=グラデーション)
   ◆ ヘッダー画像           ← ヒーロー背景画像 (URL or リポジトリ内パス)
                               推奨サイズ: 1920×220px (比率 約8.7:1)
   ◆ ヘッダー文字タイトル   ← ヒーローの大見出し
   ◆ ヘッダー文字色         ← 大見出しの文字色
   ◆ ヘッダー文字説明       ← ヒーローのサブ説明文
   ◆ ヘッダー文字説明色     ← サブ説明文の文字色

   ◆ 背景色                 ← ページ背景色
   ◆ 背景画像               ← ページ背景画像 (タイル繰り返し / 推奨: 400×400px)
   ============================================================ */
window.GH_loadPageConfig = async function () {
  const owner  = GH_CONFIG.owner;
  const repo   = GH_CONFIG.portalRepo   || 'app-portal';
  const branch = GH_CONFIG.portalBranch || 'main';

  // main → master の順にフォールバック
  const text =
    (await _ghText(owner, repo, 'Page_specified.txt', branch)) ||
    (await _ghText(owner, repo, 'Page_specified.txt', 'master'));
  if (!text) return null;

  const sections = _parseSections(text);
  const get = (...keys) => _getSectionLines(sections, keys);
  const asset = v => _resolveAsset(owner, repo, branch, v);

  const heroColors = get('ヘッダー色', 'ヘッダー背景色', 'hero_color');

  return {
    // ナビゲーションバー
    siteTitle:      get('サイト名',       'ブランド名',       'site_title')[0]    || null,
    siteIcon:       get('サイトアイコン', 'ブランドアイコン', 'site_icon')[0]     || null,
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

    // ページ背景
    bgColor:        get('背景色', 'background_color', 'bg_color')[0] || null,
    bgImage:        asset(get('背景画像', 'background_image', 'bg_image')[0]),
  };
};
