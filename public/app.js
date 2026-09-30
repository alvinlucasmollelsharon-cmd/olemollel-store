const PHONE_FALLBACK = '+225 767 777 778';
const WA_FALLBACK = '225767777778';
const PRODUCT_PAGE_SIZE = 24;
const ADMIN_PRODUCT_PAGE_SIZE = 60;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const staticPages = () => document.body.dataset.staticSite === 'true';
function readLocal(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; }
  catch { return fallback; }
}
function readArray(key) { const value = readLocal(key, []); return Array.isArray(value) ? value : []; }

const state = {
  store: { business: { phone: PHONE_FALLBACK, whatsapp: WA_FALLBACK, email: '', hours: 'Monday–Saturday · 9:00–18:00 GMT', location: 'Côte d’Ivoire' }, categories: [], faqs: [], products: [] },
  user: null,
  category: 'All instruments', query: '', priceLimit: 'all', sort: 'featured', productLimit: PRODUCT_PAGE_SIZE, adminProductLimit: ADMIN_PRODUCT_PAGE_SIZE,
  cart: readArray('olemoll_cart').filter(row => row && typeof row.id === 'string').map(row => ({ id: row.id, quantity: Math.max(1, Math.min(99, Number(row.quantity) || 1)) })),
  wishlist: readArray('olemoll_wishlist').filter(id => typeof id === 'string'),
  recent: readArray('olemoll_recent').filter(id => typeof id === 'string'),
  compare: readArray('olemoll_compare').filter(id => typeof id === 'string'),
  authMode: 'login', adminTab: 'overview', adminProducts: [], adminInquiries: [],
  cartBeforeCheckout: null, preferencesHydrating: false, preferenceTimer: null, revealObserver: null,
};
function saveLocal(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing may disable storage. */ } }
function esc(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function safeImage(value) {
  const text = String(value || '');
  const localPath = text.replace(/^\/+/, '');
  if (/^(?:uploads|products)\//.test(localPath) && !localPath.includes('..')) return localPath;
  try { const parsed = new URL(text); if (parsed.protocol === 'https:') return parsed.href; } catch { /* Use fallback. */ }
  return 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=900&q=80';
}
function money(value) { return `${new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(Number(value) || 0)} TZS`; }
function productById(id) { return state.store.products.find(product => product.id === id); }
function productsByIds(ids) { return ids.map(productById).filter(Boolean); }
function whatsappUrl(message) { return `https://wa.me/${(state.store.business.whatsapp || WA_FALLBACK).replace(/\D/g, '')}?text=${encodeURIComponent(message)}`; }
function productMessage(product) { return `Hello ${state.store.business.name || 'OLEMOLLEL ONLINE SHOPPING'}, I am interested in buying ${product.name}. Please provide me with more information and the current price.`; }
function toast(message, type = '') {
  const node = document.createElement('div'); node.className = `toast ${type}`.trim(); node.textContent = message;
  $('#toast-region').append(node); window.setTimeout(() => node.remove(), 3400);
}
function api(path, options = {}) {
  return fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } }).then(async response => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Something went wrong. Please try again.');
    return payload;
  });
}
function apiPost(path, data, method = 'POST') { return api(path, { method, body: JSON.stringify(data) }); }

function openLayer(target) {
  closeLayers();
  const overlay = $('#overlay'); overlay.hidden = false;
  if (target.classList.contains('drawer')) {
    target.classList.add('open'); target.setAttribute('aria-hidden', 'false');
  } else {
    target.hidden = false;
    requestAnimationFrame(() => target.classList.add('open'));
  }
  document.body.style.overflow = 'hidden';
}
function closeLayers() {
  $$('.drawer.open').forEach(drawer => { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); });
  $$('.modal-shell.open').forEach(modal => { modal.classList.remove('open'); window.setTimeout(() => { if (!modal.classList.contains('open')) modal.hidden = true; }, 260); });
  $('#overlay').hidden = true;
  document.body.style.overflow = '';
}
function openModal(id) { openLayer($(`#${id}`)); }
function openDrawer(id) { openLayer($(`#${id}`)); }

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  const dark = theme === 'dark';
  $('#theme-toggle').setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
  $('.theme-icon').textContent = dark ? '☼' : '☾';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#1e211e' : '#f7f6f1';
}
function initTheme() {
  const saved = readLocal('olemoll_theme', 'light'); applyTheme(saved === 'dark' ? 'dark' : 'light');
  $('#theme-toggle').addEventListener('click', () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark'; saveLocal('olemoll_theme', next); applyTheme(next);
  });
}

function iconFor(category) {
  const icons = { 'Keyboards & Pianos': '♬', Guitars: '♫', 'Drums & Percussion': '◉', 'Brass Instruments': '♧', 'String Instruments': '♬', Microphones: '♩', 'Audio Equipment': '◖', 'Musical Accessories': '✳' };
  return icons[category] || '♪';
}
function renderCategories() {
  const categories = state.store.categories;
  forgetReveals($('#category-grid'));
  $('#category-grid').innerHTML = categories.map((category, index) => {
    const count = state.store.products.filter(product => product.category === category).length;
    return `<button class="category-card" data-category="${esc(category)}"><span class="category-icon" aria-hidden="true">${iconFor(category)}</span><span class="category-info"><strong>${esc(category)}</strong><small>${count} ${count === 1 ? 'instrument' : 'instruments'}</small></span><span class="category-arrow" aria-hidden="true">↗</span></button>`;
  }).join('');
  $('#filter-row').innerHTML = ['All instruments', ...categories].map(category => `<button class="filter-pill ${state.category === category ? 'active' : ''}" data-filter="${esc(category)}">${esc(category)}</button>`).join('');
  const quickFilters = [{ label: 'All products', value: 'All instruments' }, ...categories.map(category => ({ label: category, value: category }))];
  $('#quick-categories').innerHTML = quickFilters.map(item => `<button class="quick-category-pill ${state.category === item.value ? 'active' : ''}" data-filter="${esc(item.value)}">${esc(item.label)}</button>`).join('');
}
function productTag(product) {
  if (product.newArrival) return '<span class="product-badge badge-new">New arrival</span>';
  if (product.bestSeller) return '<span class="product-badge">Popular</span>';
  if (product.featured) return '<span class="product-badge">Selected</span>';
  return '';
}
function productCard(product) {
  const wished = state.wishlist.includes(product.id), compared = state.compare.includes(product.id);
  return `<article class="product-card" data-product-card="${esc(product.id)}">
    <div class="product-image-wrap" data-action="details" data-id="${esc(product.id)}" role="button" tabindex="0" aria-label="View ${esc(product.name)} details">
    <img class="product-image" src="${esc(safeImage(product.image))}" alt="Representative product photo for ${esc(product.name)}" loading="lazy" data-image-fallback>
      ${productTag(product)}
      <span class="product-actions-top"><button class="round-tool ${wished ? 'is-saved' : ''}" data-action="wishlist" data-id="${esc(product.id)}" aria-label="${wished ? 'Remove from' : 'Add to'} wishlist" title="${wished ? 'Saved' : 'Save'}">${wished ? '♥' : '♡'}</button><button class="round-tool ${compared ? 'compare-active' : ''}" data-action="compare" data-id="${esc(product.id)}" aria-label="${compared ? 'Remove from' : 'Add to'} comparison" title="Compare">⇄</button></span>
      <button class="product-quick-add" data-action="add" data-id="${esc(product.id)}" aria-label="Add ${esc(product.name)} to bag" title="Add to bag">+</button>
    </div>
    <div class="product-info"><span class="product-category">${esc(product.category)}</span><h3 class="product-title" data-action="details" data-id="${esc(product.id)}">${esc(product.name)}</h3>
      <div class="product-card-bottom"><span class="price-stack"><small>Indicative price</small><span class="product-price">${money(product.price)}</span></span><span class="stock-hint"><i class="stock-dot"></i> ${esc(product.availability || 'Ask about stock')}</span></div>
      <div class="product-links"><button class="details-link" data-action="details" data-id="${esc(product.id)}">View details <span aria-hidden="true">↗</span></button><a class="whatsapp-link buy-button" data-action="whatsapp" data-id="${esc(product.id)}" href="${whatsappUrl(productMessage(product))}" target="_blank" rel="noopener" aria-label="Buy ${esc(product.name)} on WhatsApp" title="Buy on WhatsApp">Buy</a></div>
    </div>
  </article>`;
}
function visibleProducts() {
  let list = [...state.store.products];
  if (state.category !== 'All instruments') list = list.filter(product => product.category === state.category);
  if (state.query) list = list.filter(product => `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(state.query.toLowerCase()));
  if (state.priceLimit !== 'all') list = list.filter(product => Number(product.price) <= Number(state.priceLimit));
  if (state.sort === 'price-low') list.sort((a, b) => a.price - b.price);
  else if (state.sort === 'price-high') list.sort((a, b) => b.price - a.price);
  else if (state.sort === 'new') list.sort((a, b) => Number(b.newArrival) - Number(a.newArrival) || Number(b.featured) - Number(a.featured));
  else if (state.sort === 'bestseller') list.sort((a, b) => Number(b.bestSeller) - Number(a.bestSeller));
  else list.sort((a, b) => Number(b.featured) - Number(a.featured));
  return list;
}
function renderProducts() {
  const list = visibleProducts();
  const shown = list.slice(0, state.productLimit);
  forgetReveals($('#product-grid'));
  const feedback = $('#search-feedback');
  feedback.hidden = false;
  feedback.textContent = state.query
    ? `Showing ${shown.length.toLocaleString('en-TZ')} of ${list.length.toLocaleString('en-TZ')} results for “${state.query}”`
    : `Showing ${shown.length.toLocaleString('en-TZ')} of ${list.length.toLocaleString('en-TZ')} products`;
  $('#product-grid').innerHTML = list.length ? shown.map(productCard).join('') : `<div class="empty-results"><span>♪</span><strong>Nothing in this key just yet.</strong><p>Try another search or category, or ask us to help you find it.</p><button class="button button-dark" data-action="clear-filters">Show all instruments</button></div>`;
  const loadMore = $('#load-more-products');
  loadMore.hidden = list.length <= state.productLimit;
  loadMore.textContent = `Show ${Math.min(PRODUCT_PAGE_SIZE, list.length - state.productLimit).toLocaleString('en-TZ')} more products`;
  renderCategories(); renderRecentlyViewed(); updateWishlistCount(); updateCartCount(); renderCompareChip(); observeReveals();
}
function renderRecentlyViewed() {
  const products = productsByIds(state.recent.slice(0, 4));
  forgetReveals($('#recent-grid'));
  $('#recent-section').hidden = !products.length;
  $('#recent-grid').innerHTML = products.map(productCard).join('');
}
function rememberViewed(id) {
  state.recent = [id, ...state.recent.filter(item => item !== id)].slice(0, 6); saveLocal('olemoll_recent', state.recent); renderRecentlyViewed();
}
function renderFaqs() {
  forgetReveals($('#faq-list'));
  $('#faq-list').innerHTML = state.store.faqs.map((item, index) => `<div class="faq-item ${index === 0 ? 'open' : ''}"><button class="faq-question" aria-expanded="${index === 0 ? 'true' : 'false'}"><span>${esc(item.question)}</span><span>+</span></button><div class="faq-answer">${esc(item.answer)}</div></div>`).join('');
  observeReveals();
}
function forgetReveals(root) {
  if (!root || !state.revealObserver) return;
  root.querySelectorAll('.reveal').forEach(node => state.revealObserver.unobserve(node));
}
function observeReveals(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  if (!state.revealObserver) {
    state.revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        state.revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
  }
  root.querySelectorAll('.section-block, .category-card, .product-card, .faq-item, .care-card, .contact-card').forEach(node => {
    if (node.hidden || node.closest('[hidden]') || node.classList.contains('reveal')) return;
    node.classList.add('reveal'); state.revealObserver.observe(node);
  });
}
function applyBusinessInfo() {
  const biz = state.store.business;
  const phone = biz.phone || PHONE_FALLBACK;
  const whatsapp = biz.whatsapp || WA_FALLBACK;
  const waIntro = `Hello ${biz.name || 'OLEMOLLEL ONLINE SHOPPING'}, I have a question about an instrument.`;
  $('#contact-number').textContent = phone; $('#contact-call-number').textContent = phone; $('#footer-phone').textContent = phone;
  $('#contact-wa').href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(waIntro)}`; $('#footer-whatsapp').href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(waIntro)}`;
  $('#contact-tel').href = `tel:${phone.replace(/[^+\d]/g, '')}`;
  $('#business-hours').textContent = `${biz.hours || 'Monday–Saturday · 9:00–18:00 GMT'} · ${biz.location || 'Côte d’Ivoire'}`;
  if (biz.email) $('#email-support-caption').textContent = biz.email;
  $$('[data-contact="whatsapp"]').forEach(link => { link.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(waIntro)}`; link.target = '_blank'; link.rel = 'noopener'; });
  $$('[data-contact="call"]').forEach(link => { link.href = `tel:${phone.replace(/[^+\d]/g, '')}`; });
  $$('[data-contact="email"]').forEach(link => { link.href = biz.email ? `mailto:${encodeURIComponent(biz.email)}?subject=${encodeURIComponent('OLEMOLLEL customer support')}` : `https://wa.me/${whatsapp}?text=${encodeURIComponent(`${waIntro} Please share your customer support email address.`)}`; link.target = biz.email ? '' : '_blank'; link.rel = 'noopener'; });
}
function loadStore() {
  const storeRequest = api('/api/store').catch(async () => {
    const response = await fetch('./store.json');
    if (!response.ok) throw new Error('The product list could not be loaded.');
    return response.json();
  });
  return storeRequest.then(data => {
    state.store = data;
    if (!Array.isArray(state.cart)) state.cart = [];
    if (!Array.isArray(state.wishlist)) state.wishlist = [];
    renderProducts(); renderFaqs(); applyBusinessInfo();
  }).catch(error => {
    toast(`The shop could not load: ${error.message}`, 'error');
    $('#product-grid').innerHTML = '<div class="empty-results"><strong>The shop is taking a little break.</strong><p>Please refresh the page or contact us on WhatsApp.</p></div>';
  });
}

function updateCartCount() {
  state.cart = state.cart.filter(row => productById(row.id)); saveLocal('olemoll_cart', state.cart);
  const count = state.cart.reduce((sum, row) => sum + row.quantity, 0);
  $('#cart-count').textContent = count; $('#cart-open').setAttribute('aria-label', `Shopping bag, ${count} ${count === 1 ? 'item' : 'items'}`);
  schedulePreferenceSave();
}
function updateWishlistCount() {
  state.wishlist = state.wishlist.filter(id => productById(id));
  state.compare = state.compare.filter(id => productById(id));
  saveLocal('olemoll_wishlist', state.wishlist);
  saveLocal('olemoll_compare', state.compare);
  const count = state.wishlist.length;
  $('#wishlist-count').textContent = count;
  $('#wishlist-open').setAttribute('aria-label', `Wishlist, ${count} ${count === 1 ? 'saved item' : 'saved items'}`);
  schedulePreferenceSave();
}
function schedulePreferenceSave() {
  if (state.user?.role !== 'customer' || state.preferencesHydrating) return;
  window.clearTimeout(state.preferenceTimer);
  state.preferenceTimer = window.setTimeout(() => {
    apiPost('/api/account/preferences', { cart: state.cart, wishlist: state.wishlist }, 'PUT').catch(() => {});
  }, 350);
}
async function syncAccountPreferences() {
  if (state.user?.role !== 'customer') return;
  state.preferencesHydrating = true;
  try {
    const saved = await api('/api/account/preferences');
    const combined = new Map((saved.cart || []).map(item => [item.id, Math.max(1, Number(item.quantity) || 1)]));
    state.cart.forEach(item => combined.set(item.id, Math.max(combined.get(item.id) || 0, item.quantity)));
    state.cart = [...combined].map(([id, quantity]) => ({ id, quantity }));
    state.wishlist = [...new Set([...(saved.wishlist || []), ...state.wishlist])];
    saveLocal('olemoll_cart', state.cart); saveLocal('olemoll_wishlist', state.wishlist);
    await apiPost('/api/account/preferences', { cart: state.cart, wishlist: state.wishlist }, 'PUT');
  } catch { /* Keep the local selection if an account sync is temporarily unavailable. */ }
  state.preferencesHydrating = false;
  renderProducts();
}
function addToCart(id) {
  if (!productById(id)) return;
  const existing = state.cart.find(row => row.id === id);
  if (existing) existing.quantity = Math.min(99, existing.quantity + 1); else state.cart.push({ id, quantity: 1 });
  saveLocal('olemoll_cart', state.cart); renderProducts(); renderCart(); toast('Added to your bag.', 'success');
}
function changeQuantity(id, delta) {
  const row = state.cart.find(item => item.id === id); if (!row) return;
  row.quantity += delta; if (row.quantity <= 0) state.cart = state.cart.filter(item => item.id !== id);
  saveLocal('olemoll_cart', state.cart); renderProducts(); renderCart();
}
function removeCartItem(id) { state.cart = state.cart.filter(item => item.id !== id); saveLocal('olemoll_cart', state.cart); renderProducts(); renderCart(); }
function renderCart() {
  const rows = state.cart.map(row => ({ ...row, product: productById(row.id) })).filter(row => row.product);
  $('#cart-title-count').textContent = rows.length ? `(${rows.reduce((n, item) => n + item.quantity, 0)})` : '';
  if (!rows.length) {
    $('#cart-content').innerHTML = `<div class="drawer-empty"><span class="empty-bag-icon">♪</span><h3>Your bag has room for music.</h3><p>Browse instruments and save a few possibilities here.</p><a class="button button-dark" href="#shop" data-close>Explore instruments</a></div>`;
    $('#cart-footer').innerHTML = ''; return;
  }
  $('#cart-content').innerHTML = rows.map(({ product, quantity }) => `<div class="cart-row"><img class="drawer-product-image" src="${esc(safeImage(product.image))}" alt="${esc(product.name)}"><div class="drawer-product-main"><small>${esc(product.category)}</small><strong>${esc(product.name)}</strong><span>${money(product.price)}</span><div class="qty-stepper"><button data-action="qty-down" data-id="${esc(product.id)}" aria-label="Decrease quantity">−</button><span>${quantity}</span><button data-action="qty-up" data-id="${esc(product.id)}" aria-label="Increase quantity">+</button></div></div><button class="remove-item" data-action="remove-cart" data-id="${esc(product.id)}" aria-label="Remove ${esc(product.name)}">×</button></div>`).join('');
  const total = rows.reduce((sum, row) => sum + row.product.price * row.quantity, 0);
  $('#cart-footer').innerHTML = `<div class="cart-total-row"><span>Indicative total</span><strong>${money(total)}</strong></div><p class="cart-disclaimer">No payment is taken here. We’ll confirm the current price, stock and delivery with you first.</p><button class="button button-dark full-button" data-action="checkout">Continue on WhatsApp <span>↗</span></button>`;
}
function toggleWishlist(id) {
  if (state.wishlist.includes(id)) { state.wishlist = state.wishlist.filter(value => value !== id); toast('Removed from your wishlist.'); }
  else { state.wishlist.unshift(id); toast('Saved to your wishlist.', 'success'); }
  saveLocal('olemoll_wishlist', state.wishlist); renderProducts(); renderWishlist();
}
function renderWishlist() {
  const products = productsByIds(state.wishlist);
  $('#wishlist-title-count').textContent = products.length ? `(${products.length})` : '';
  if (!products.length) { $('#wishlist-content').innerHTML = `<div class="drawer-empty"><span class="empty-bag-icon">♡</span><h3>Nothing saved just yet.</h3><p>Tap the heart on an instrument to keep it close.</p><a class="button button-dark" href="#shop" data-close>Browse instruments</a></div>`; return; }
  $('#wishlist-content').innerHTML = products.map(product => `<div class="wishlist-row"><img class="drawer-product-image" src="${esc(safeImage(product.image))}" alt="${esc(product.name)}"><div class="drawer-product-main"><small>${esc(product.category)}</small><strong>${esc(product.name)}</strong><span>${money(product.price)}</span><button class="button button-outline" data-action="add" data-id="${esc(product.id)}">Add to bag</button></div><button class="remove-item" data-action="wishlist" data-id="${esc(product.id)}" aria-label="Remove from wishlist">×</button></div>`).join('');
}
function renderCompareChip() {
  const count = productsByIds(state.compare).length; $('#compare-chip').hidden = count < 2; $('#compare-chip-count').textContent = count;
}
function toggleCompare(id) {
  if (state.compare.includes(id)) state.compare = state.compare.filter(value => value !== id);
  else if (state.compare.length >= 3) { toast('Compare up to three instruments at a time.'); return; }
  else state.compare.push(id);
  saveLocal('olemoll_compare', state.compare); renderProducts();
}
function renderCompare() {
  const products = productsByIds(state.compare);
  if (products.length < 2) { toast('Choose at least two instruments to compare.'); return; }
  const rows = [['Price', product => money(product.price)], ['Category', product => product.category], ['Availability', product => product.availability], ...[...new Set(products.flatMap(product => Object.keys(product.specifications || {})))].slice(0, 6).map(spec => [spec, product => product.specifications?.[spec] || '—'])];
  $('#compare-content').innerHTML = `<div class="compare-wrap"><table class="compare-table"><thead><tr><th>Compare</th>${products.map(product => `<th><img src="${esc(safeImage(product.image))}" alt=""><span>${esc(product.name)}</span><button class="details-link" data-action="details" data-id="${esc(product.id)}">View details ↗</button></th>`).join('')}</tr></thead><tbody>${rows.map(([label, get]) => `<tr><td>${esc(label)}</td>${products.map(product => `<td>${esc(get(product))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><button class="button button-outline" style="margin-top:16px" id="compare-clear-inside">Clear comparison</button>`;
  openDrawer('compare-drawer');
}

function showProduct(id) {
  const product = productById(id); if (!product) return;
  rememberViewed(id);
  const specs = Object.entries(product.specifications || {});
  const reviews = product.reviews || [];
  $('#product-modal-body').innerHTML = `<div class="product-detail-layout"><div class="detail-image-wrap"><img class="detail-image" src="${esc(safeImage(product.image))}" alt="Representative product photo for ${esc(product.name)}"></div><div class="detail-copy"><span class="detail-category">${esc(product.category)}</span><h2>${esc(product.name)}</h2><div class="detail-price">${money(product.price)}</div><span class="detail-price-note">Indicative price · Ask us to confirm today’s price</span><div class="detail-availability"><i class="stock-dot"></i> ${esc(product.availability || 'Confirm availability')}</div><p>${esc(product.description)}</p>${specs.length ? `<div class="spec-list">${specs.map(([label, value]) => `<div class="spec-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>` : ''}<div class="option-line"><strong>Options</strong>${(product.colors || []).map(color => `<span class="option-chip">${esc(color)}</span>`).join('') || '<span class="option-chip">Ask us about available options</span>'}</div><div class="detail-rating">${reviews.length ? `<span class="review-stars">${reviews.map(review => '★'.repeat(review.rating)).join(' ')}</span> · ${reviews.length} customer ${reviews.length === 1 ? 'review' : 'reviews'}` : 'No customer reviews yet · Ask us for a recommendation'}</div>${reviews.length ? `<div class="review-list">${reviews.map(review => `<div class="review-item"><strong>${esc(review.name)} · <span class="review-stars">${'★'.repeat(review.rating)}</span></strong><p>${esc(review.comment)}</p></div>`).join('')}</div>` : ''}<div class="detail-actions"><a class="button button-dark detail-buy-button" href="${whatsappUrl(productMessage(product))}" target="_blank" rel="noopener" aria-label="Buy ${esc(product.name)} on WhatsApp">Buy</a><div class="detail-call-row"><a class="button button-outline" href="tel:${(state.store.business.phone || PHONE_FALLBACK).replace(/[^+\d]/g, '')}">Call to buy</a><button class="button button-outline" data-action="contact-seller" data-id="${esc(product.id)}">Contact seller</button></div><button class="button button-outline" data-action="add" data-id="${esc(product.id)}">Add to bag <span>＋</span></button></div></div></div>`;
  openModal('product-modal');
}

function showAuth(mode = 'login', ownerHint = false) {
  state.authMode = mode;
  const ownerText = ownerHint ? '<p class="form-intro">Owner access is protected. Sign in with the account configured for this shop.</p>' : '';
  const heading = mode === 'register' ? 'Make it yours.' : 'Welcome back.';
  $('#account-modal-body').innerHTML = `<p class="form-eyebrow">${ownerHint ? 'Owner access' : 'Your OLEMOLLEL account'}</p><h2 class="form-heading" id="account-modal-title">${heading}</h2>${ownerText || '<p class="form-intro">Save your favourites and keep your enquiries close. Browsing never requires an account.</p>'}<div class="form-notice" id="auth-notice" role="alert"></div><form id="auth-form"><div class="field" ${mode === 'register' ? '' : 'hidden'}><label for="auth-name">Your name</label><input id="auth-name" name="name" autocomplete="name" ${mode === 'register' ? 'required' : ''}></div><div class="field"><label for="auth-email">Email address</label><input id="auth-email" type="email" name="email" autocomplete="email" required></div><div class="field"><label for="auth-password">Password</label><input id="auth-password" type="password" name="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" minlength="${mode === 'register' ? '10' : '1'}" required><small style="color:var(--muted);font-size:8px" ${mode === 'register' ? '' : 'hidden'}>Use at least 10 characters.</small></div><button class="button button-dark form-submit" type="submit">${mode === 'register' ? 'Create account' : 'Sign in'} <span>↗</span></button></form>${mode === 'register' ? '<div class="auth-benefits"><span>Browse as a guest</span><span>Saved wishlist & bag</span><span>Previous enquiries</span><span>Secure password handling</span></div>' : ''}<p class="form-switch">${mode === 'register' ? 'Already have an account?' : 'New to OLEMOLLEL?'} <button id="auth-switch" type="button">${mode === 'register' ? 'Sign in' : 'Create an account'}</button></p>`;
  $('#auth-form').addEventListener('submit', submitAuth);
  $('#auth-switch').addEventListener('click', () => showAuth(state.authMode === 'register' ? 'login' : 'register', ownerHint));
  openModal('account-modal');
}
async function submitAuth(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget);
  const data = Object.fromEntries(form.entries());
  try {
    const response = await apiPost(state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login', data);
    state.user = response.user;
    if (state.user.role === 'customer') await syncAccountPreferences();
    toast(state.user.role === 'admin' ? 'Owner access granted.' : `Welcome, ${state.user.name}.`, 'success'); closeLayers();
    if (state.user.role === 'admin') openAdmin(); else openAccount();
  } catch (error) { showFormNotice($('#auth-notice'), error.message); }
}
function showFormNotice(node, message, type = 'error') { node.textContent = message; node.className = `form-notice show ${type}`; }
async function openAccount() {
  if (!state.user) return showAuth('login');
  if (state.user.role === 'admin') return openAdmin();
  let inquiriesForUser = [];
  try { inquiriesForUser = (await api('/api/account/inquiries')).inquiries || []; } catch { /* Existing account session may have expired. */ }
  $('#account-modal-body').innerHTML = `<p class="form-eyebrow">Your OLEMOLLEL account</p><h2 class="form-heading" id="account-modal-title">Good to see you.</h2><div class="account-profile"><span class="avatar-initials">${esc(state.user.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase())}</span><span><strong>${esc(state.user.name)}</strong><small>${esc(state.user.email)}</small></span></div><div class="form-grid"><button class="button button-outline" id="account-wishlist">♡ Your wishlist (${productsByIds(state.wishlist).length})</button><button class="button button-outline" id="account-cart">Bag (${state.cart.reduce((n, row) => n + row.quantity, 0)})</button></div><h3 class="account-section-title">Previous enquiries</h3>${inquiriesForUser.length ? inquiriesForUser.map(item => `<div class="account-inquiry"><div><strong>${new Date(item.createdAt).toLocaleDateString()}</strong><span>${esc(item.status)}</span></div><p>${esc(item.message)}${item.items?.length ? `\n${item.items.map(row => `${row.quantity} × ${row.name}`).join('\n')}` : ''}</p></div>`).join('') : '<p class="form-intro">Enquiries you send while signed in will appear here.</p>'}<button class="button button-outline form-submit" id="account-logout">Sign out</button>`;
  $('#account-wishlist').addEventListener('click', () => { closeLayers(); renderWishlist(); openDrawer('wishlist-drawer'); });
  $('#account-cart').addEventListener('click', () => { closeLayers(); renderCart(); openDrawer('cart-drawer'); });
  $('#account-logout').addEventListener('click', async () => { try { await apiPost('/api/auth/logout', {}); } catch {} state.user = null; closeLayers(); toast('You are signed out.'); });
  openModal('account-modal');
}
async function checkSession() {
  try { state.user = (await api('/api/session')).user; } catch { state.user = null; }
  $('#account-open').title = state.user ? `Signed in as ${state.user.name}` : 'Your account';
  if (state.user?.role === 'customer') await syncAccountPreferences();
}

function openCheckout() {
  if (!state.cart.length) { renderCart(); return; }
  const rows = state.cart.map(row => `${row.quantity} × ${productById(row.id)?.name || 'Instrument'}`).join('<br>');
  const total = state.cart.reduce((sum, row) => sum + (productById(row.id)?.price || 0) * row.quantity, 0);
  $('#checkout-modal-body').innerHTML = `<p class="form-eyebrow">Almost there</p><h2 class="form-heading" id="checkout-title">Let’s confirm the details.</h2><p class="form-intro">${staticPages() ? 'Review your request, then open WhatsApp to send it to our team.' : 'Share a way for us to reply. We’ll save your enquiry and open WhatsApp with your selected instruments, then confirm current prices and availability together.'}</p><div class="admin-help" style="margin:0 0 15px"><strong>Your selection</strong><br>${rows}<br><br>Indicative total: ${money(total)}</div><div class="form-notice" id="checkout-notice" role="alert"></div><form id="checkout-form"><div class="field"><label for="checkout-name">Your name</label><input id="checkout-name" name="name" autocomplete="name" value="${esc(state.user?.name || '')}" required maxlength="100"></div><div class="form-grid"><div class="field"><label for="checkout-phone">Phone / WhatsApp</label><input id="checkout-phone" name="phone" autocomplete="tel" value="${esc(state.user?.email ? '' : '')}" placeholder="Your number" maxlength="40"></div><div class="field"><label for="checkout-email">Email (optional)</label><input id="checkout-email" type="email" name="email" autocomplete="email" value="${esc(state.user?.email || '')}" placeholder="you@example.com" maxlength="254"></div></div><div class="field"><label for="checkout-message">Anything we should know?</label><textarea id="checkout-message" name="message" maxlength="1500" placeholder="Your preferred options, timing, or delivery question">Order request. Please confirm current price, availability and delivery.</textarea></div><button class="button button-dark form-submit" type="submit">${staticPages() ? 'Continue to WhatsApp' : 'Save enquiry & continue on WhatsApp'} <span>↗</span></button></form>`;
  $('#checkout-form').addEventListener('submit', submitCheckout); openModal('checkout-modal');
}
async function submitCheckout(event) {
  event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (!fields.phone.trim() && !fields.email.trim()) { showFormNotice($('#checkout-notice'), 'Please add a phone number or email so we can reply.'); return; }
  const items = state.cart.map(row => { const product = productById(row.id); return { productId: row.id, name: product?.name || 'Instrument', quantity: row.quantity, price: product?.price || 0 }; });
  const message = `${fields.message}\nIndicative total: ${money(items.reduce((total, item) => total + item.price * item.quantity, 0))}`;
  const whatsappMessage = `Hello ${state.store.business.name || 'OLEMOLLEL ONLINE SHOPPING'}, I’d like to enquire about this order:\n${items.map(item => `${item.quantity} × ${item.name}`).join('\n')}\n\nIndicative total: ${money(items.reduce((total, item) => total + item.price * item.quantity, 0))}\n\n${fields.message}\nName: ${fields.name}${fields.phone ? `\nPhone: ${fields.phone}` : ''}`;
  if (!staticPages()) {
    try { await apiPost('/api/inquiries', { ...fields, message, items }); }
    catch (error) { showFormNotice($('#checkout-notice'), `${error.message} Your WhatsApp draft is ready; you can still send it.`, 'error'); }
  }
  const target = whatsappUrl(whatsappMessage);
  window.location.href = target;
}

function contactProduct(id) {
  const product = productById(id); const subject = product ? `Question about ${product.name}` : 'Customer question';
  const email = state.store.business.email;
  if (email) { window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}`; return; }
  window.open(whatsappUrl(`Hello ${state.store.business.name || 'OLEMOLLEL ONLINE SHOPPING'}, I’d like to ask about ${product?.name || 'an instrument'}. Please share your customer support email address.`), '_blank', 'noopener');
}

async function openAdmin() {
  if (!state.user || state.user.role !== 'admin') return showAuth('login', true);
  await refreshAdminSummary(); state.adminTab = 'overview'; renderAdmin(); openModal('admin-modal');
}
async function refreshAdminSummary() {
  try {
    const [summary, productData, inquiryData] = await Promise.all([api('/api/admin/summary'), api('/api/admin/products'), api('/api/admin/inquiries')]);
    state.adminSummary = summary; state.adminProducts = productData.products; state.adminInquiries = inquiryData.inquiries;
  } catch (error) { toast(error.message, 'error'); }
}
function renderAdmin() {
  const tabs = [['overview', 'Overview'], ['products', 'Products'], ['inquiries', 'Inquiries'], ['settings', 'Store settings']];
  $('#admin-modal-body').innerHTML = `<div class="admin-topbar"><div><p class="form-eyebrow">OLEMOLLEL ONLINE SHOPPING</p><h2 class="form-heading" id="admin-title">Owner dashboard</h2></div><button class="button button-outline" id="admin-signout">Sign out</button></div><div class="admin-tabs" role="tablist">${tabs.map(([key, label]) => `<button class="admin-tab ${state.adminTab === key ? 'active' : ''}" role="tab" aria-selected="${state.adminTab === key}" data-admin-tab="${key}">${label}</button>`).join('')}</div><div class="admin-panel" id="admin-panel">${renderAdminPanel()}</div>`;
  $('#admin-signout').addEventListener('click', async () => { try { await apiPost('/api/auth/logout', {}); } catch {} state.user = null; closeLayers(); toast('Owner signed out.'); });
}
function renderAdminPanel() {
  if (state.adminTab === 'overview') {
    const summary = state.adminSummary || {};
    return `<div class="admin-stat-grid"><div class="admin-stat"><small>Products</small><strong>${summary.productCount || 0}</strong></div><div class="admin-stat"><small>Categories</small><strong>${summary.categories || 0}</strong></div><div class="admin-stat"><small>All enquiries</small><strong>${summary.inquiryCount || 0}</strong></div><div class="admin-stat"><small>Needs attention</small><strong>${summary.newInquiryCount || 0}</strong></div></div><div class="admin-help"><strong>Welcome to the owner dashboard.</strong><br>Update the catalog, review customer enquiries, change store contact details and manage the FAQ. Product prices are shown as indicative; confirm availability with customers before an order is completed.</div>`;
  }
  if (state.adminTab === 'products') {
    const visible = state.adminProducts.slice(0, state.adminProductLimit);
    return `<div class="admin-toolbar"><h3>Product catalogue · ${state.adminProducts.length.toLocaleString('en-TZ')}</h3><button class="button button-dark" id="admin-new-product">＋ Add product</button></div><div id="product-form-slot"></div><p class="admin-catalog-count">Showing ${visible.length.toLocaleString('en-TZ')} of ${state.adminProducts.length.toLocaleString('en-TZ')} products</p><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Image</th><th>Product</th><th>Category</th><th>Price</th><th>Tags</th><th></th></tr></thead><tbody>${visible.map(product => `<tr><td><img class="admin-thumb" src="${esc(safeImage(product.image))}" alt="" loading="lazy"></td><td>${esc(product.name)}</td><td>${esc(product.category)}</td><td>${money(product.price)}</td><td>${[product.featured && 'Featured', product.newArrival && 'New', product.bestSeller && 'Popular'].filter(Boolean).map(esc).join(', ') || '—'}</td><td><button data-admin-edit="${esc(product.id)}">Edit</button> <button data-admin-delete="${esc(product.id)}">Delete</button></td></tr>`).join('')}</tbody></table></div>${visible.length < state.adminProducts.length ? '<div class="admin-load-more-wrap"><button class="button button-outline" type="button" id="admin-load-more-products">Show more products</button></div>' : ''}`;
  }
  if (state.adminTab === 'inquiries') return `<div class="admin-toolbar"><h3>Customer enquiries</h3><span class="muted">${state.adminInquiries.length} total</span></div>${state.adminInquiries.length ? state.adminInquiries.map(item => `<div class="admin-inquiry-card" data-admin-inquiry="${esc(item.id)}"><div class="admin-inquiry-head"><div><strong>${esc(item.name)}</strong><small>${esc(item.email || 'No email')}${item.phone ? ` · ${esc(item.phone)}` : ''} · ${new Date(item.createdAt).toLocaleString()}</small></div><select class="admin-status-select" aria-label="Enquiry status"><option value="new" ${item.status === 'new' ? 'selected' : ''}>New</option><option value="contacted" ${item.status === 'contacted' ? 'selected' : ''}>Contacted</option><option value="closed" ${item.status === 'closed' ? 'selected' : ''}>Closed</option></select></div><p>${esc(item.message)}${item.items?.length ? `\n${item.items.map(row => `${row.quantity} × ${row.name} · ${money(row.price)}`).join('\n')}` : ''}</p><div class="field"><label>Owner note</label><textarea class="owner-note" maxlength="1000" placeholder="Optional follow-up note">${esc(item.ownerNote || '')}</textarea></div><button class="button button-outline" data-admin-save-inquiry="${esc(item.id)}">Save update</button></div>`).join('') : '<div class="admin-help">No customer enquiries yet. Cart enquiries submitted on the website will appear here.</div>'}`;
  if (state.adminTab === 'settings') {
    const biz = state.store.business;
    return `<div class="admin-toolbar"><h3>Store details & FAQs</h3><span class="muted">Shown to customers</span></div><div class="form-notice" id="settings-notice" role="alert"></div><form id="settings-form"><div class="form-grid"><div class="field"><label>Business name</label><input name="name" maxlength="100" value="${esc(biz.name)}" required></div><div class="field"><label>Phone number</label><input name="phone" maxlength="40" value="${esc(biz.phone)}" required></div><div class="field"><label>WhatsApp number (international format)</label><input name="whatsapp" maxlength="30" value="${esc(biz.whatsapp)}" required></div><div class="field"><label>Customer support email (optional)</label><input name="email" type="email" maxlength="254" value="${esc(biz.email || '')}"></div><div class="field"><label>Business hours</label><input name="hours" maxlength="120" value="${esc(biz.hours)}"></div><div class="field"><label>Location</label><input name="location" maxlength="120" value="${esc(biz.location)}"></div></div><div class="field"><label>Categories (one per line)</label><textarea name="categories" maxlength="2000">${esc(state.store.categories.join('\n'))}</textarea></div><div class="field"><label>FAQs (one question per line, answer on the next line)</label><textarea name="faqs" rows="10" maxlength="10000">${esc(state.store.faqs.map(item => `${item.question}\n${item.answer}`).join('\n\n'))}</textarea></div><button class="button button-dark" type="submit">Save store details</button></form>`;
  }
  return '';
}
function buildAdminProductForm(product = null) {
  const editing = !!product; const p = product || { name: '', category: '', price: '', description: '', image: '', availability: 'Confirm availability', featured: false, newArrival: false, bestSeller: false, colors: [], specifications: {}, reviews: [] };
  $('#product-form-slot').innerHTML = `<form class="product-form" id="product-edit-form" data-product-id="${esc(product?.id || '')}"><h4>${editing ? 'Edit instrument' : 'Add an instrument'}</h4><div class="form-grid"><div class="field"><label>Product name</label><input name="name" maxlength="100" value="${esc(p.name)}" required></div><div class="field"><label>Category</label><input name="category" list="admin-categories" maxlength="80" value="${esc(p.category)}" required><datalist id="admin-categories">${state.store.categories.map(category => `<option value="${esc(category)}">`).join('')}</datalist></div><div class="field"><label>Price (TZS)</label><input name="price" type="number" min="0" step="1" value="${esc(p.price)}" required></div><div class="field"><label>Availability shown to customers</label><input name="availability" maxlength="80" value="${esc(p.availability || 'Confirm availability')}"></div></div><div class="field"><label>Description</label><textarea name="description" maxlength="1200" required>${esc(p.description)}</textarea></div><div class="form-grid"><div class="field"><label>Product image URL</label><input name="image" id="admin-image-url" maxlength="800" value="${esc(p.image)}" placeholder="https://… or upload below" required></div><div class="field"><label>Upload an image (JPEG, PNG or WebP · 3 MB max)</label><input id="admin-image-file" type="file" accept="image/jpeg,image/png,image/webp"></div></div><div class="form-grid"><div class="field"><label>Available colors / options (comma separated)</label><input name="colors" maxlength="500" value="${esc((p.colors || []).join(', '))}"></div><div class="field"><label>Specifications (one per line: label: value)</label><textarea name="specifications" maxlength="2000">${esc(Object.entries(p.specifications || {}).map(([key, value]) => `${key}: ${value}`).join('\n'))}</textarea></div></div><div class="field"><label>Customer reviews (JSON; only add verified feedback)</label><textarea name="reviews" maxlength="6000" placeholder="[]">${esc(JSON.stringify(p.reviews || [], null, 2))}</textarea></div><div class="check-row"><label><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> Featured</label><label><input type="checkbox" name="newArrival" ${p.newArrival ? 'checked' : ''}> New arrival</label><label><input type="checkbox" name="bestSeller" ${p.bestSeller ? 'checked' : ''}> Best seller</label></div><div class="form-notice" id="product-notice" role="alert"></div><div class="product-form-actions"><button class="button button-outline" type="button" id="admin-cancel-product">Cancel</button><button class="button button-dark" type="submit">${editing ? 'Save changes' : 'Add product'}</button></div></form>`;
  $('#admin-cancel-product').addEventListener('click', () => { $('#product-form-slot').innerHTML = ''; });
  $('#product-edit-form').addEventListener('submit', saveAdminProduct);
}
async function saveAdminProduct(event) {
  event.preventDefault(); const form = event.currentTarget, data = Object.fromEntries(new FormData(form).entries());
  data.featured = form.elements.featured.checked; data.newArrival = form.elements.newArrival.checked; data.bestSeller = form.elements.bestSeller.checked;
  data.colors = data.colors.split(',').map(value => value.trim()).filter(Boolean);
  data.specifications = Object.fromEntries(data.specifications.split('\n').map(line => { const index = line.indexOf(':'); return index < 0 ? ['', ''] : [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }).filter(([key, value]) => key && value));
  try { data.reviews = JSON.parse(data.reviews || '[]'); if (!Array.isArray(data.reviews)) throw new Error(); }
  catch { showFormNotice($('#product-notice'), 'Reviews must be a JSON list. Use [] when there are no verified reviews.'); return; }
  const imageFile = $('#admin-image-file').files[0];
  try {
    if (imageFile) {
      if (imageFile.size > 3 * 1024 * 1024) throw new Error('Product images must be 3 MB or smaller.');
      data.image = (await uploadImage(imageFile)).url;
    }
    if (!data.image.startsWith('/uploads/') && !data.image.startsWith('/products/') && !data.image.startsWith('https://')) throw new Error('Use a secure https image URL or upload an image.');
    const id = form.dataset.productId;
    await apiPost(id ? `/api/admin/products/${encodeURIComponent(id)}` : '/api/admin/products', data, id ? 'PUT' : 'POST');
    toast(id ? 'Product updated.' : 'Product added.', 'success'); await loadStore(); await refreshAdminSummary(); state.adminTab = 'products'; renderAdmin();
  } catch (error) { showFormNotice($('#product-notice'), error.message); }
}
function uploadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.onload = () => apiPost('/api/admin/upload', { data: reader.result }).then(resolve, reject);
    reader.readAsDataURL(file);
  });
}
async function adminSaveInquiry(button) {
  const card = button.closest('[data-admin-inquiry]'); const id = card.dataset.adminInquiry;
  try {
    await apiPost(`/api/admin/inquiries/${encodeURIComponent(id)}`, { status: $('.admin-status-select', card).value, ownerNote: $('.owner-note', card).value }, 'PATCH');
    toast('Enquiry updated.', 'success'); await refreshAdminSummary(); state.adminTab = 'inquiries'; renderAdmin();
  } catch (error) { toast(error.message, 'error'); }
}
async function saveAdminSettings(event) {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  values.categories = [...new Set(values.categories.split('\n').map(item => item.trim()).filter(Boolean))];
  const blocks = values.faqs.split(/\n\s*\n/).map(block => block.split('\n').map(line => line.trim()).filter(Boolean)).filter(lines => lines.length >= 2);
  values.faqs = blocks.map(lines => ({ question: lines[0], answer: lines.slice(1).join(' ') }));
  try {
    await apiPost('/api/admin/settings', values, 'PUT'); await loadStore(); await refreshAdminSummary(); state.adminTab = 'settings'; renderAdmin();
    const notice = $('#settings-notice'); if (notice) showFormNotice(notice, 'Store details saved.', 'success'); toast('Store details saved.', 'success');
  } catch (error) { showFormNotice($('#settings-notice'), error.message); }
}

function handleClick(event) {
  if (event.target.closest('#load-more-products')) { state.productLimit += PRODUCT_PAGE_SIZE; renderProducts(); return; }
  if (event.target.closest('#admin-load-more-products')) { state.adminProductLimit += ADMIN_PRODUCT_PAGE_SIZE; renderAdmin(); return; }
  const target = event.target.closest('[data-action]');
  if (target) {
    const { action, id } = target.dataset;
    if (action === 'details') { event.preventDefault(); showProduct(id); return; }
    if (action === 'add') { event.preventDefault(); addToCart(id); return; }
    if (action === 'wishlist') { event.preventDefault(); toggleWishlist(id); if ($('#wishlist-drawer').classList.contains('open')) renderWishlist(); return; }
    if (action === 'compare') { event.preventDefault(); toggleCompare(id); return; }
    if (action === 'whatsapp') { return; }
    if (action === 'qty-down') { changeQuantity(id, -1); return; }
    if (action === 'qty-up') { changeQuantity(id, 1); return; }
    if (action === 'remove-cart') { removeCartItem(id); return; }
    if (action === 'checkout') { openCheckout(); return; }
    if (action === 'contact-seller') { contactProduct(id); return; }
    if (action === 'clear-filters') { state.category = 'All instruments'; state.query = ''; state.priceLimit = 'all'; state.productLimit = PRODUCT_PAGE_SIZE; $('#header-search').value = ''; $('#price-filter').value = 'all'; renderProducts(); return; }
  }
  const category = event.target.closest('[data-category]');
  if (category) { state.category = category.dataset.category; state.productLimit = PRODUCT_PAGE_SIZE; renderProducts(); $('#shop').scrollIntoView({ behavior: 'smooth' }); return; }
  const filter = event.target.closest('[data-filter]');
  if (filter) { state.category = filter.dataset.filter; state.productLimit = PRODUCT_PAGE_SIZE; renderProducts(); if (filter.closest('.quick-category-bar')) $('#shop').scrollIntoView({ behavior: 'smooth' }); return; }
  const faq = event.target.closest('.faq-question');
  if (faq) { const item = faq.closest('.faq-item'); const open = item.classList.toggle('open'); faq.setAttribute('aria-expanded', String(open)); return; }
  const adminTab = event.target.closest('[data-admin-tab]');
  if (adminTab) { state.adminTab = adminTab.dataset.adminTab; renderAdmin(); return; }
  const edit = event.target.closest('[data-admin-edit]');
  if (edit) { buildAdminProductForm(state.adminProducts.find(product => product.id === edit.dataset.adminEdit)); return; }
  const remove = event.target.closest('[data-admin-delete]');
  if (remove) {
    const product = state.adminProducts.find(item => item.id === remove.dataset.adminDelete);
    if (product && window.confirm(`Remove “${product.name}” from the catalogue?`)) api(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' }).then(async () => { toast('Product removed.'); await loadStore(); await refreshAdminSummary(); renderAdmin(); }).catch(error => toast(error.message, 'error'));
    return;
  }
  const saveInquiry = event.target.closest('[data-admin-save-inquiry]'); if (saveInquiry) { adminSaveInquiry(saveInquiry); return; }
}

function init() {
  initTheme(); $('#year').textContent = new Date().getFullYear();
  if (staticPages()) { $('#account-open').hidden = true; $('#owner-tools').hidden = true; }
  $('#header-search').addEventListener('input', event => { state.query = event.target.value.trim(); state.productLimit = PRODUCT_PAGE_SIZE; renderProducts(); });
  $('#price-filter').addEventListener('change', event => { state.priceLimit = event.target.value; state.productLimit = PRODUCT_PAGE_SIZE; renderProducts(); });
  $('#load-more-products').addEventListener('click', () => { state.productLimit += PRODUCT_PAGE_SIZE; renderProducts(); });
  $('#sort-select').addEventListener('change', event => { state.sort = event.target.value; renderProducts(); });
  $('#cart-open').addEventListener('click', () => { renderCart(); openDrawer('cart-drawer'); });
  $('#wishlist-open').addEventListener('click', () => { renderWishlist(); openDrawer('wishlist-drawer'); });
  $('#account-open').addEventListener('click', () => state.user ? openAccount() : showAuth('login'));
  $('#owner-tools').addEventListener('click', event => { event.preventDefault(); openAdmin(); });
  $('#wishlist-title').addEventListener('click', () => {});
  $('#clear-recent').addEventListener('click', () => { state.recent = []; saveLocal('olemoll_recent', []); renderRecentlyViewed(); });
  $('#care-float').addEventListener('click', () => { const open = !$('#care-popover').hidden; $('#care-popover').hidden = open; $('#care-float').setAttribute('aria-expanded', String(!open)); });
  $('#care-close').addEventListener('click', () => { $('#care-popover').hidden = true; $('#care-float').setAttribute('aria-expanded', 'false'); });
  $('#care-account').addEventListener('click', () => { $('#care-popover').hidden = true; $('#care-float').setAttribute('aria-expanded', 'false'); state.user ? openAccount() : showAuth('login'); });
  $('#popover-faq').addEventListener('click', () => { $('#care-popover').hidden = true; $('#care-float').setAttribute('aria-expanded', 'false'); });
  $('#back-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  $('#compare-show').addEventListener('click', renderCompare); $('#compare-clear').addEventListener('click', () => { state.compare = []; saveLocal('olemoll_compare', []); renderProducts(); });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-close]')) { closeLayers(); return; }
    if (event.target === $('#overlay')) { closeLayers(); return; }
    if (event.target.closest('#compare-clear-inside')) { state.compare = []; saveLocal('olemoll_compare', []); closeLayers(); renderProducts(); return; }
    if (event.target.closest('#admin-new-product')) { buildAdminProductForm(); return; }
    if (event.target.closest('#settings-form')) return;
    handleClick(event);
  });
  document.addEventListener('error', event => {
    const image = event.target;
    if (image instanceof HTMLImageElement && !image.dataset.fallbackUsed) {
      image.dataset.fallbackUsed = 'true';
      image.src = 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=900&q=80';
    }
  }, true);
  $('#overlay').addEventListener('click', closeLayers);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeLayers(); $('#care-popover').hidden = true; $('#care-float').setAttribute('aria-expanded', 'false'); }
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); const search = $('#header-search'), box = $('.search-box'); if (window.innerWidth <= 800) box.classList.add('open'); search.focus(); }
    if (event.key === 'Enter' && event.target.matches('[data-action="details"]')) showProduct(event.target.dataset.id);
  });
  document.addEventListener('submit', event => { if (event.target.matches('#settings-form')) saveAdminSettings(event); });
  $('#menu-toggle').addEventListener('click', () => { const open = $('#menu-toggle').getAttribute('aria-expanded') === 'true'; $('#menu-toggle').setAttribute('aria-expanded', String(!open)); $('#main-nav').classList.toggle('open', !open); });
  $$('#main-nav a').forEach(link => link.addEventListener('click', () => { $('#main-nav').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded', 'false'); }));
  $('.search-box').addEventListener('click', event => { if (window.innerWidth <= 800 && !$('.search-box').classList.contains('open') && event.target !== $('#header-search')) { event.preventDefault(); $('.search-box').classList.add('open'); $('#header-search').focus(); } });
  window.addEventListener('storage', event => { if (event.key === 'olemoll_cart' || event.key === 'olemoll_wishlist') { state.cart = readLocal('olemoll_cart', []); state.wishlist = readLocal('olemoll_wishlist', []); renderProducts(); if ($('#cart-drawer').classList.contains('open')) renderCart(); if ($('#wishlist-drawer').classList.contains('open')) renderWishlist(); } });
  renderProducts(); loadStore().then(checkSession);
}

init();
