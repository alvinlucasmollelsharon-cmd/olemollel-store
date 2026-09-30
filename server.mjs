import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, join, normalize, relative } from 'node:path';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);
const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = join(root, 'public');
const dataRoot = join(root, 'data');
const uploadRoot = join(publicRoot, 'uploads');
mkdirSync(dataRoot, { recursive: true });
mkdirSync(uploadRoot, { recursive: true });

const file = (name) => join(dataRoot, name);
const readJson = (name, fallback) => {
  try { return JSON.parse(readFileSync(file(name), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; writeJson(name, fallback); return structuredClone(fallback); }
};
const writeJson = (name, data) => writeFileSync(file(name), `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
const store = () => readJson('store.json', { business: {}, categories: [], products: [], faqs: [] });
const users = () => readJson('users.json', []);
const inquiries = () => readJson('inquiries.json', []);
const sessions = new Map();
const attempts = new Map();
const sessionLifetime = 1000 * 60 * 60 * 12;
const bodyLimit = 5 * 1024 * 1024;

const json = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(value));
};
const text = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(value);
};
const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const cookieOptions = (maxAge = 60 * 60 * 12) => `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

function sessionFor(req) {
  const token = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('olemoll_session='))?.split('=').slice(1).join('=');
  const entry = token && sessions.get(token);
  if (!entry || entry.expires < Date.now()) { if (token) sessions.delete(token); return null; }
  return { token, ...entry };
}

function issueSession(res, user) {
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, { id: user.id, role: user.role, email: user.email, name: user.name, expires: Date.now() + sessionLifetime });
  res.setHeader('Set-Cookie', `olemoll_session=${token}; ${cookieOptions()}`);
}

function limited(req, res, key, max = 12) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = attempts.get(`${key}:${ip}`) || { count: 0, start: now };
  if (now - record.start > 15 * 60 * 1000) { record.count = 0; record.start = now; }
  record.count += 1;
  attempts.set(`${key}:${ip}`, record);
  if (record.count > max) { json(res, 429, { error: 'Too many attempts. Please wait a little and try again.' }); return true; }
  return false;
}

function checkOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    if (new URL(origin).host === req.headers.host) return true;
  } catch { /* invalid origin */ }
  json(res, 403, { error: 'Request origin could not be verified.' });
  return false;
}

function requireUser(req, res, role) {
  const session = sessionFor(req);
  if (!session) { json(res, 401, { error: 'Please sign in to continue.' }); return null; }
  if (role && session.role !== role) { json(res, 403, { error: 'This area is for the shop owner.' }); return null; }
  return session;
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > bodyLimit) throw Object.assign(new Error('This request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Please check the submitted information.'), { status: 400 }); }
}

function productInput(input, existing = {}) {
  const name = clean(input.name ?? existing.name, 100);
  const category = clean(input.category ?? existing.category, 80);
  const description = clean(input.description ?? existing.description, 1200);
  const image = clean(input.image ?? existing.image, 800);
  const price = Number(input.price ?? existing.price);
  if (!name || !category || !description || !image || !Number.isFinite(price) || price < 0 || price > 100000000) {
    throw Object.assign(new Error('Add a name, category, description, image and valid price.'), { status: 400 });
  }
  let specs = input.specifications ?? existing.specifications ?? {};
  if (typeof specs === 'string') {
    try { specs = JSON.parse(specs); } catch { specs = Object.fromEntries(specs.split('\n').map(line => line.split(':').map(v => v.trim())).filter(row => row.length >= 2 && row[0])); }
  }
  const specifications = Object.fromEntries(Object.entries(specs).slice(0, 12).map(([k, v]) => [clean(k, 50), clean(v, 160)]).filter(([k, v]) => k && v));
  const reviews = Array.isArray(input.reviews ?? existing.reviews) ? (input.reviews ?? existing.reviews).slice(0, 50).map(review => ({
    name: clean(review.name, 80), rating: Math.max(1, Math.min(5, Number(review.rating) || 5)), comment: clean(review.comment, 500), date: clean(review.date, 40)
  })).filter(review => review.name && review.comment) : [];
  return {
    ...existing,
    id: existing.id || clean(input.id, 80).toLowerCase().replace(/[^a-z0-9-]/g, '-') || randomUUID(),
    name, category, description, image, price,
    availability: clean(input.availability ?? existing.availability ?? 'Confirm availability', 80),
    featured: Boolean(input.featured ?? existing.featured), newArrival: Boolean(input.newArrival ?? existing.newArrival), bestSeller: Boolean(input.bestSeller ?? existing.bestSeller),
    colors: Array.isArray(input.colors ?? existing.colors) ? (input.colors ?? existing.colors).slice(0, 12).map(color => clean(color, 40)).filter(Boolean) : [],
    specifications, reviews
  };
}

async function bootstrapAdmin() {
  const email = clean(process.env.ADMIN_EMAIL, 254).toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email && !password) return;
  if (!validEmail(email) || password.length < 12) throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters to create the owner account.');
  const list = users();
  const current = list.find(user => user.email === email);
  if (current) {
    if (current.role !== 'admin') throw new Error('ADMIN_EMAIL already belongs to a customer account. Choose another email or remove that account from data/users.json.');
    return;
  }
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)).toString('hex');
  list.push({ id: randomUUID(), name: clean(process.env.ADMIN_NAME || 'Shop owner', 80), email, role: 'admin', salt, hash, createdAt: new Date().toISOString() });
  writeJson('users.json', list);
  console.log(`Owner account created for ${email}.`);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = decodeURIComponent(url.pathname);
  const method = req.method || 'GET';

  if (path.startsWith('/api/') && method !== 'GET' && !checkOrigin(req, res)) return;

  if (path === '/api/store' && method === 'GET') {
    const data = store();
    return json(res, 200, { business: data.business, categories: data.categories, faqs: data.faqs, products: data.products });
  }
  if (path === '/api/session' && method === 'GET') {
    const session = sessionFor(req);
    return json(res, 200, { user: session ? { id: session.id, name: session.name, email: session.email, role: session.role } : null });
  }
  if (path === '/api/auth/register' && method === 'POST') {
    if (limited(req, res, 'register', 5)) return;
    const input = await body(req);
    const name = clean(input.name, 80), email = clean(input.email, 254).toLowerCase(), password = String(input.password || '');
    if (!name || !validEmail(email) || password.length < 10 || password.length > 200) return json(res, 400, { error: 'Enter your name, a valid email and a password with at least 10 characters.' });
    const list = users();
    if (list.some(user => user.email === email)) return json(res, 409, { error: 'An account already exists for this email. Please sign in.' });
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, 64)).toString('hex');
    const user = { id: randomUUID(), name, email, role: 'customer', salt, hash, createdAt: new Date().toISOString() };
    list.push(user); writeJson('users.json', list); issueSession(res, user);
    return json(res, 201, { user: { id: user.id, name, email, role: user.role } });
  }
  if (path === '/api/auth/login' && method === 'POST') {
    if (limited(req, res, 'login', 8)) return;
    const input = await body(req), email = clean(input.email, 254).toLowerCase(), password = String(input.password || '');
    const user = users().find(record => record.email === email);
    const candidateSalt = user?.salt || '00'.repeat(16);
    const candidate = await scrypt(password, candidateSalt, 64);
    const expected = Buffer.from(user?.hash || '00'.repeat(64), 'hex');
    const accepted = expected.length === candidate.length && timingSafeEqual(candidate, expected);
    if (!user || !accepted) return json(res, 401, { error: 'Email or password was not recognized.' });
    issueSession(res, user);
    return json(res, 200, { user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    const session = sessionFor(req);
    if (session) sessions.delete(session.token);
    res.setHeader('Set-Cookie', `olemoll_session=; ${cookieOptions(0)}`);
    return json(res, 200, { ok: true });
  }
  if (path === '/api/inquiries' && method === 'POST') {
    if (limited(req, res, 'inquiry', 10)) return;
    const input = await body(req);
    const name = clean(input.name, 100), email = clean(input.email, 254), phone = clean(input.phone, 40), message = clean(input.message, 1500);
    if (!name || (!email && !phone) || (email && !validEmail(email)) || !message) return json(res, 400, { error: 'Please add your name, a way for us to reply, and your question.' });
    const cartItems = Array.isArray(input.items) ? input.items.slice(0, 30).map(row => ({
      productId: clean(row.productId, 80), name: clean(row.name, 100), quantity: Math.max(1, Math.min(99, Number(row.quantity) || 1)), price: Math.max(0, Number(row.price) || 0)
    })) : [];
    const session = sessionFor(req);
    const record = { id: randomUUID(), name, email, phone, message, items: cartItems, userId: session?.id || null, status: 'new', createdAt: new Date().toISOString() };
    const list = inquiries(); list.unshift(record); writeJson('inquiries.json', list);
    return json(res, 201, { ok: true, inquiryId: record.id });
  }
  if (path === '/api/account/inquiries' && method === 'GET') {
    const session = requireUser(req, res, 'customer'); if (!session) return;
    const list = inquiries().filter(item => item.userId === session.id).map(({ id, message, items, status, createdAt }) => ({ id, message, items, status, createdAt }));
    return json(res, 200, { inquiries: list });
  }
  if (path === '/api/account/preferences' && method === 'GET') {
    const session = requireUser(req, res, 'customer'); if (!session) return;
    const user = users().find(record => record.id === session.id);
    return json(res, 200, { cart: user?.cart || [], wishlist: user?.wishlist || [] });
  }
  if (path === '/api/account/preferences' && method === 'PUT') {
    const session = requireUser(req, res, 'customer'); if (!session) return;
    const input = await body(req), list = users(), user = list.find(record => record.id === session.id);
    if (!user) return json(res, 401, { error: 'Please sign in again.' });
    const productIds = new Set(store().products.map(product => product.id));
    user.cart = Array.isArray(input.cart) ? input.cart.slice(0, 50).map(item => ({ id: clean(item.id, 80), quantity: Math.max(1, Math.min(99, Number(item.quantity) || 1)) })).filter(item => productIds.has(item.id)) : [];
    user.wishlist = Array.isArray(input.wishlist) ? [...new Set(input.wishlist.slice(0, 100).map(id => clean(id, 80)).filter(id => productIds.has(id)))] : [];
    writeJson('users.json', list);
    return json(res, 200, { cart: user.cart, wishlist: user.wishlist });
  }
  if (path === '/api/admin/summary' && method === 'GET') {
    if (!requireUser(req, res, 'admin')) return;
    const data = store(); return json(res, 200, { productCount: data.products.length, inquiryCount: inquiries().length, newInquiryCount: inquiries().filter(item => item.status === 'new').length, categories: data.categories.length });
  }
  if (path === '/api/admin/inquiries' && method === 'GET') {
    if (!requireUser(req, res, 'admin')) return;
    return json(res, 200, { inquiries: inquiries() });
  }
  const inquiryMatch = path.match(/^\/api\/admin\/inquiries\/([^/]+)$/);
  if (inquiryMatch && method === 'PATCH') {
    if (!requireUser(req, res, 'admin')) return;
    const input = await body(req), list = inquiries(), inquiry = list.find(item => item.id === inquiryMatch[1]);
    if (!inquiry) return json(res, 404, { error: 'Inquiry not found.' });
    if (['new', 'contacted', 'closed'].includes(input.status)) inquiry.status = input.status;
    inquiry.ownerNote = clean(input.ownerNote ?? inquiry.ownerNote, 1000);
    writeJson('inquiries.json', list); return json(res, 200, { inquiry });
  }
  if (path === '/api/admin/products' && method === 'GET') {
    if (!requireUser(req, res, 'admin')) return;
    return json(res, 200, { products: store().products });
  }
  if (path === '/api/admin/products' && method === 'POST') {
    if (!requireUser(req, res, 'admin')) return;
    const input = await body(req), data = store(), product = productInput(input);
    if (data.products.some(item => item.id === product.id)) product.id = randomUUID();
    data.products.unshift(product);
    if (!data.categories.includes(product.category)) data.categories.push(product.category);
    writeJson('store.json', data); return json(res, 201, { product });
  }
  const productMatch = path.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (productMatch && method === 'PUT') {
    if (!requireUser(req, res, 'admin')) return;
    const input = await body(req), data = store(), index = data.products.findIndex(item => item.id === productMatch[1]);
    if (index < 0) return json(res, 404, { error: 'Product not found.' });
    data.products[index] = productInput(input, data.products[index]);
    if (!data.categories.includes(data.products[index].category)) data.categories.push(data.products[index].category);
    writeJson('store.json', data); return json(res, 200, { product: data.products[index] });
  }
  if (productMatch && method === 'DELETE') {
    if (!requireUser(req, res, 'admin')) return;
    const data = store(), count = data.products.length;
    data.products = data.products.filter(item => item.id !== productMatch[1]);
    if (data.products.length === count) return json(res, 404, { error: 'Product not found.' });
    writeJson('store.json', data); return json(res, 200, { ok: true });
  }
  if (path === '/api/admin/upload' && method === 'POST') {
    if (!requireUser(req, res, 'admin')) return;
    const input = await body(req), match = String(input.data || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return json(res, 400, { error: 'Choose a JPEG, PNG or WebP image.' });
    const content = Buffer.from(match[2], 'base64');
    if (!content.length || content.length > 3 * 1024 * 1024) return json(res, 413, { error: 'Product images must be 3 MB or smaller.' });
    const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[match[1]];
    const name = `${randomUUID()}${extension}`; writeFileSync(join(uploadRoot, name), content, { flag: 'wx' });
    return json(res, 201, { url: `/uploads/${name}` });
  }
  if (path === '/api/admin/settings' && method === 'PUT') {
    if (!requireUser(req, res, 'admin')) return;
    const input = await body(req), data = store();
    data.business = {
      ...data.business,
      name: clean(input.name ?? data.business.name, 100),
      phone: clean(input.phone ?? data.business.phone, 40),
      whatsapp: clean(input.whatsapp ?? data.business.whatsapp, 30).replace(/\D/g, ''),
      email: clean(input.email ?? data.business.email, 254),
      hours: clean(input.hours ?? data.business.hours, 120), location: clean(input.location ?? data.business.location, 120)
    };
    if (input.email && !validEmail(data.business.email)) return json(res, 400, { error: 'Please enter a valid support email.' });
    if (Array.isArray(input.categories)) data.categories = [...new Set(input.categories.slice(0, 40).map(item => clean(item, 80)).filter(Boolean))];
    if (Array.isArray(input.faqs)) data.faqs = input.faqs.slice(0, 30).map(item => ({ question: clean(item.question, 200), answer: clean(item.answer, 1200) })).filter(item => item.question && item.answer);
    writeJson('store.json', data); return json(res, 200, { business: data.business, categories: data.categories, faqs: data.faqs });
  }

  if (path.startsWith('/api/')) return json(res, 404, { error: 'That page could not be found.' });

  const requested = path === '/' ? '/index.html' : path;
  const candidate = normalize(join(publicRoot, requested));
  const relativePath = relative(publicRoot, candidate);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) return text(res, 403, 'Forbidden');
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
  if (!existsSync(candidate)) return text(res, 404, 'Not found');
  res.writeHead(200, {
    'Content-Type': types[extname(candidate)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://images.unsplash.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
  });
  createReadStream(candidate).pipe(res);
}

const server = http.createServer((req, res) => {
  route(req, res).catch(error => {
    console.error(error);
    if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.' });
    else res.end();
  });
});

await bootstrapAdmin();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => console.log(`OLEMOLLEL ONLINE SHOPPING is ready on http://${host}:${port}`));

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
