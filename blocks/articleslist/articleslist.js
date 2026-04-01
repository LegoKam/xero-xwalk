import { readBlockConfig } from '../../scripts/aem.js';

const DEFAULT_ENDPOINT = `https://publish-p152232-e1579596.adobeaemcloud.com/graphql/execute.json/xero-xwalk/articlelist?ts=${Date.now()}`;

function createCard(article) {
  const title = article?.title?.trim();
  const image = article?.banner?._dmS7Url;
  const path = article?._path?.trim();

  if (!title) {
    return null;
  }

  const li = document.createElement('li');
  const wrapper = path ? document.createElement('a') : document.createElement('article');

  wrapper.className = 'articleslist-card';

  if (path) {
    wrapper.href = path;
    wrapper.setAttribute('aria-label', title);
  } else {
    wrapper.classList.add('articleslist-card-disabled');
  }

  if (image) {
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'articleslist-card-image';

    const img = document.createElement('img');
    img.src = image;
    img.alt = title;
    img.loading = 'lazy';

    imageWrapper.append(img);
    wrapper.append(imageWrapper);
  }

  const body = document.createElement('div');
  body.className = 'articleslist-card-body';

  const heading = document.createElement('h3');
  heading.textContent = title;

  body.append(heading);
  wrapper.append(body);
  li.append(wrapper);

  return li;
}

async function fetchArticles(endpoint) {
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`Failed to load articles: ${response.status}`);
  }

  const payload = await response.json();
  return payload?.data?.articlesList?.items ?? [];
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const endpoint = config.endpoint || DEFAULT_ENDPOINT;
  const count = Number.parseInt(config.count, 10);

  block.textContent = '';
  block.classList.add('articleslist-loading');

  try {
    const items = await fetchArticles(endpoint);
    const articles = Number.isNaN(count) ? items : items.slice(0, count);
    const cards = articles
      .map(createCard)
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
    console.error('Error loading articleslist block', error);
    block.innerHTML = '<p>Unable to load articles right now.</p>';
  } finally {
    block.classList.remove('articleslist-loading');
  }
}
