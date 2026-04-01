/* eslint-disable no-underscore-dangle -- GraphQL response uses _prefixed AEM fields */
import { readBlockConfig } from '../../scripts/aem.js';

const DEFAULT_ENDPOINT = 'https://publish-p152232-e1579596.adobeaemcloud.com/graphql/execute.json/xero-xwalk/articlelist';

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
 * @returns {string}
 */
function getArticleDetailHref(contentPath) {
  const url = new URL('/index/article-detail', window.location.origin);
  url.searchParams.set('articlePath', contentPath);
  return `${url.pathname}${url.search}`;
}

function createCard(article, authorMode) {
  const title = article?.title?.trim();
  const path = article?._path?.trim();
  const image = getImageSrc(article, authorMode);
  const aueResource = getAueResource(article);

  if (!title) {
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
    wrapper.href = getArticleDetailHref(path);
    wrapper.setAttribute('aria-label', title);
  } else {
    wrapper.classList.add('articles-list-card-disabled');
  }

  if (image) {
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'articles-list-card-image';

    const img = document.createElement('img');
    img.src = image;
    img.alt = title;
    img.loading = 'lazy';
    img.dataset.aueProp = 'banner';
    img.dataset.aueType = 'media';

    imageWrapper.append(img);
    wrapper.append(imageWrapper);
  }

  const body = document.createElement('div');
  body.className = 'articles-list-card-body';

  const heading = document.createElement('h3');
  heading.textContent = title;
  heading.dataset.aueProp = 'title';
  heading.dataset.aueType = 'text';

  body.append(heading);
  wrapper.append(body);
  li.append(wrapper);

  return li;
}

async function fetchArticles(endpoint, authorMode) {
  const response = await fetch(endpoint, getFetchOptions(authorMode));

  if (!response.ok) {
    throw new Error(`Failed to load articles: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.data?.articlesList?.items ?? [];
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const authorMode = isAuthorMode();
  const endpoint = getEndpoint(config.endpoint || DEFAULT_ENDPOINT, authorMode);
  const count = Number.parseInt(config.count, 10);

  block.textContent = '';
  block.classList.add('articles-list-loading');

  try {
    const items = await fetchArticles(endpoint, authorMode);
    const articles = Number.isNaN(count) ? items : items.slice(0, count);
    const cards = articles
      .map((article) => createCard(article, authorMode))
      .filter(Boolean);

    if (!cards.length) {
      block.innerHTML = '<p>No articles available.</p>';
      return;
    }

    const list = document.createElement('ul');
    list.append(...cards);
    block.replaceChildren(list);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error loading articles-list block', error);
    block.innerHTML = '<p>Unable to load articles right now.</p>';
  } finally {
    block.classList.remove('articles-list-loading');
  }
}
