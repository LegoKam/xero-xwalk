/* eslint-disable no-underscore-dangle -- GraphQL response uses _prefixed AEM fields */
import { readBlockConfig } from '../../scripts/aem.js';

const DEFAULT_ARTICLE_BY_PATH_BASE = 'https://publish-p152232-e1579596.adobeaemcloud.com/graphql/execute.json/xero-xwalk/articleByPath';

function isAuthorMode() {
  const { href } = window.location;
  const ancestorOriginCount = window.location.ancestorOrigins?.length || 0;

  return Boolean(
    ancestorOriginCount
    || (href.includes('author') && href.includes('adobeaemcloud.com')),
  );
}

/**
 * @param {string} baseEndpoint e.g. .../articleByPath (no ;articlePath yet)
 * @param {string} articlePath AEM dam path
 * @param {boolean} authorMode
 */
function buildArticleByPathUrl(baseEndpoint, articlePath, authorMode) {
  let ep = baseEndpoint.trim() || DEFAULT_ARTICLE_BY_PATH_BASE;
  if (authorMode) {
    ep = ep.replace('://publish-', '://author-');
  }
  const joined = `${ep};articlePath=${decodeURIComponent(articlePath)}`;
  const sep = joined.includes('?') ? '&' : '?';
  return `${joined}${sep}_=${Date.now()}`;
}

function getFetchOptions(authorMode) {
  if (!authorMode) {
    return {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  return {
    method: 'GET',
    headers: {
      'Access-Control-Request-Headers': 'Authorization',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };
}

/**
 * @param {object} image banner object from GraphQL
 * @param {boolean} authorMode
 * @returns {string}
 */
function getBannerSrc(image, authorMode) {
  if (!image) return '';
  return (
    (authorMode && image._authorUrl)
    || image._dmS7Url
    || image._publishUrl
    || ''
  );
}

/**
 * @param {Element} block
 * @param {Record<string, string>} config
 * @returns {string|null}
 */
function resolveArticlePath(block, config) {
  const params = new URLSearchParams(window.location.search);
  const fromArticlePath = params.get('articlePath');
  if (fromArticlePath?.trim()) return fromArticlePath.trim();

  const fromArticle = params.get('article');
  if (fromArticle?.trim()) return fromArticle.trim();

  if (config.articlePath?.trim()) return config.articlePath.trim();

  const damLink = block.querySelector('a[href*="/content/dam"]');
  if (damLink) {
    try {
      const u = new URL(damLink.getAttribute('href'), window.location.origin);
      return u.pathname || null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Fallback copy from authored `title` field (default content) before render.
 * @param {Element} block
 * @returns {string}
 */
function readFallbackMessage(block) {
  const byProp = block.querySelector('[data-aue-prop="title"]');
  if (byProp?.textContent?.trim()) return byProp.textContent.trim();
  const first = block.querySelector(':scope > div');
  if (first?.textContent?.trim()) return first.textContent.trim();
  return 'Article not found';
}

/**
 * @param {Element} block
 * @param {string} message
 */
function renderFallback(block, message) {
  block.classList.remove('article-detail-loading', 'article-detail-loaded');
  block.classList.add('article-detail-empty');
  delete block.dataset.aueType;
  delete block.dataset.aueResource;
  delete block.dataset.aueFilter;
  const p = document.createElement('p');
  p.className = 'article-detail-fallback';
  p.setAttribute('role', 'status');
  p.setAttribute('aria-live', 'polite');
  p.textContent = message;
  block.replaceChildren(p);
}

/**
 * @param {object} data fetch JSON
 * @returns {object|null}
 */
function getArticleItem(data) {
  const root = data?.data;
  return root?.articlesByPath?.item || root?.articleByPath?.item || null;
}

/**
 * @param {Element} block
 * @param {object} item GraphQL item
 * @param {boolean} authorMode
 */
function renderArticle(block, item, authorMode) {
  block.classList.remove('article-detail-loading', 'article-detail-empty');
  block.classList.add('article-detail-loaded');
  block.replaceChildren();

  const inner = document.createElement('div');
  inner.className = 'article-detail-inner';

  const bannerSrc = getBannerSrc(item.banner, authorMode);
  if (bannerSrc) {
    const banner = document.createElement('div');
    banner.className = 'article-detail-banner';
    const img = document.createElement('img');
    img.src = bannerSrc;
    img.alt = item.title || '';
    img.loading = 'eager';
    img.decoding = 'async';
    img.dataset.aueProp = 'banner';
    img.dataset.aueType = 'media';
    banner.appendChild(img);
    inner.appendChild(banner);
  }

  const body = document.createElement('div');
  body.className = 'article-detail-body';

  const title = document.createElement('h1');
  title.className = 'article-detail-title';
  title.textContent = item.title || '';
  title.dataset.aueProp = 'title';
  title.dataset.aueType = 'text';
  body.appendChild(title);

  if (item.subtitle?.trim()) {
    const sub = document.createElement('p');
    sub.className = 'article-detail-subtitle';
    sub.textContent = item.subtitle.trim();
    sub.dataset.aueProp = 'subtitle';
    sub.dataset.aueType = 'text';
    body.appendChild(sub);
  }

  const detailHtml = item.detail?.html || item.articleDetail?.html || '';
  const content = document.createElement('div');
  content.className = 'article-detail-content default-content-wrapper';
  content.innerHTML = detailHtml;
  content.dataset.aueProp = 'detail';
  content.dataset.aueType = 'richtext';
  body.appendChild(content);

  inner.appendChild(body);
  block.appendChild(inner);

  const aueResource = item._path
    ? `urn:aemconnection:${item._path}/jcr:content/data/${item._variation || 'master'}`
    : '';
  block.dataset.aueType = 'reference';
  if (aueResource) block.dataset.aueResource = aueResource;
  block.dataset.aueFilter = 'cf';
}

/**
 * loads and decorates the article-detail block (GraphQL articleByPath)
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  const fallbackMessage = readFallbackMessage(block);
  const config = readBlockConfig(block);
  const authorMode = isAuthorMode();
  const baseEndpoint = config.endpoint?.trim() || DEFAULT_ARTICLE_BY_PATH_BASE;
  const articlePath = resolveArticlePath(block, config);

  block.classList.add('article-detail-loading');

  if (!articlePath) {
    renderFallback(block, 'Article path not provided');
    return;
  }

  const url = buildArticleByPathUrl(baseEndpoint, articlePath, authorMode);

  try {
    const response = await fetch(url, getFetchOptions(authorMode));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const item = getArticleItem(data);

    if (!item) {
      renderFallback(block, fallbackMessage);
      return;
    }

    renderArticle(block, item, authorMode);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('article-detail: fetch failed', error);
    renderFallback(block, fallbackMessage);
  }
}
