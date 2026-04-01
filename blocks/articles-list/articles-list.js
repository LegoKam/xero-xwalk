/* eslint-disable no-underscore-dangle -- GraphQL response uses _prefixed AEM fields */
/* eslint-disable no-console -- intentional diagnostics for this block */
import { readBlockConfig } from '../../scripts/aem.js';

const NS = '[articles-list]';
const DEFAULT_ENDPOINT = 'https://publish-p152232-e1579596.adobeaemcloud.com/graphql/execute.json/xero-xwalk/articlelist';

/**
 * @param {unknown} payload
 * @returns {object|null}
 */
function getGraphqlErrors(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return 'errors' in payload ? payload.errors : null;
}

function isAuthorMode() {
  const { href } = window.location;
  const ancestorOriginCount = window.location.ancestorOrigins?.length || 0;

  return Boolean(
    ancestorOriginCount
    || (href.includes('author') && href.includes('adobeaemcloud.com')),
  );
}

function getEndpoint(endpoint, authorMode) {
  const resolvedEndpoint = authorMode
    ? endpoint.replace('://publish-', '://author-')
    : endpoint;
  const url = new URL(resolvedEndpoint, window.location.origin);

  url.searchParams.set('_', Date.now());

  return url.toString();
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

function getImageSrc(article, authorMode) {
  const image = article?.banner;

  if (!image) {
    return '';
  }

  return (authorMode && image._authorUrl)
    || image._dmS7Url
    || image._publishUrl
    || '';
}

function getAueResource(article) {
  const path = article?._path?.trim();

  if (!path) {
    return '';
  }

  return `urn:aemconnection:${path}/jcr:content/data/${article?._variation || 'master'}`;
}

/**
 * @param {string} contentPath AEM content fragment path (_path)
 * @param {boolean} authorMode Universal Editor / AEM author preview
 * @returns {string}
 */
function getArticleDetailHref(contentPath, authorMode) {
  const basePath = authorMode
    ? '/content/xero-xwalk/index/article-detail.html'
    : '/index/article-detail';
  const url = new URL(basePath, window.location.origin);
  url.searchParams.set('articlePath', contentPath);
  return `${url.pathname}${url.search}`;
}

function createCard(article, authorMode) {
  const title = article?.title?.trim() ?? '';
  const path = article?._path?.trim();
  const image = getImageSrc(article, authorMode);
  const aueResource = getAueResource(article);

  const accessibleName = title || path?.split('/').filter(Boolean).pop() || 'Article';

  if (!path && !image) {
    return null;
  }

  const li = document.createElement('li');
  const wrapper = path ? document.createElement('a') : document.createElement('article');

  if (aueResource) {
    li.dataset.aueType = 'reference';
    li.dataset.aueResource = aueResource;
    li.dataset.aueFilter = 'cf';
  }

  wrapper.className = 'articles-list-card';

  if (path) {
    wrapper.href = getArticleDetailHref(path, authorMode);
    wrapper.setAttribute('aria-label', accessibleName);
  } else {
    wrapper.classList.add('articles-list-card-disabled');
  }

  if (image) {
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'articles-list-card-image';

    const img = document.createElement('img');
    img.src = image;
    img.alt = title || accessibleName;
    img.loading = 'lazy';
    img.dataset.aueProp = 'banner';
    img.dataset.aueType = 'media';

    imageWrapper.append(img);
    wrapper.append(imageWrapper);
  }

  li.append(wrapper);

  return li;
}

async function fetchArticles(endpoint, authorMode) {
  const fetchOptions = getFetchOptions(authorMode);
  console.log(NS, 'fetch: request', {
    url: endpoint,
    authorMode,
    credentials: fetchOptions.credentials ?? 'omit',
    headerKeys: fetchOptions.headers ? Object.keys(fetchOptions.headers) : [],
  });

  console.time(`${NS} graphql`);
  const response = await fetch(endpoint, fetchOptions);
  console.timeEnd(`${NS} graphql`);

  console.log(NS, 'fetch: response', {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get('content-type'),
  });

  if (!response.ok) {
    throw new Error(`Failed to load articles: ${response.status}`);
  }

  const payload = await response.json();
  const gqlErrors = getGraphqlErrors(payload);
  if (gqlErrors) {
    console.warn(NS, 'GraphQL errors in payload', gqlErrors);
  }

  const items = payload?.data?.articlesList?.items ?? [];
  console.log(NS, 'payload: articlesList.items', {
    count: items.length,
    hasData: Boolean(payload?.data),
    dataKeys: payload?.data ? Object.keys(payload.data) : [],
  });

  if (items.length > 0) {
    console.table(
      items.map((a, i) => ({
        idx: i,
        title: (a?.title ?? '').toString().slice(0, 60),
        _path: a?._path ?? '',
        hasBanner: Boolean(a?.banner),
      })),
    );
  }

  return items;
}

export default async function decorate(block) {
  console.groupCollapsed(`${NS} decorate`);
  console.log(NS, 'start', {
    href: window.location.href,
    blockClass: block.className,
    blockChildren: block.children.length,
  });

  const config = readBlockConfig(block);
  const authorMode = isAuthorMode();
  const endpoint = getEndpoint(config.endpoint || DEFAULT_ENDPOINT, authorMode);
  const count = Number.parseInt(config.count, 10);

  console.log(NS, 'config', { ...config });
  console.log(NS, 'resolved', {
    authorMode,
    endpoint,
    countRaw: config.count,
    countParsed: Number.isNaN(count) ? 'all (NaN)' : count,
    defaultEndpoint: DEFAULT_ENDPOINT,
  });

  block.textContent = '';
  block.classList.add('articles-list-loading');

  try {
    const items = await fetchArticles(endpoint, authorMode);
    const articles = Number.isNaN(count) ? items : items.slice(0, count);

    console.log(NS, 'after slice', {
      itemsFromApi: items.length,
      articlesAfterCount: articles.length,
      limitApplied: !Number.isNaN(count),
    });

    const cards = articles
      .map((article, index) => {
        const card = createCard(article, authorMode);
        if (!card) {
          console.warn(NS, 'createCard returned null', { index, title: article?.title });
        }
        return card;
      })
      .filter(Boolean);

    console.log(NS, 'cards built', { count: cards.length });

    if (!cards.length) {
      console.warn(NS, 'empty UI: no cards to render');
      block.innerHTML = '<p>No articles available.</p>';
      return;
    }

    const list = document.createElement('ul');
    list.append(...cards);
    block.replaceChildren(list);
    console.log(NS, 'done: list mounted', { listItemCount: cards.length });
  } catch (error) {
    console.error(NS, 'decorate failed', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    });
    block.innerHTML = '<p>Unable to load articles right now.</p>';
  } finally {
    block.classList.remove('articles-list-loading');
    console.groupEnd();
  }
}
