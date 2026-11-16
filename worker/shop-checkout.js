// Cloudflare Worker for the putrika.net shop.
// Creates a Stripe Checkout Session (embedded on putrika.net) from the cart.
// Prices live HERE, not in the browser, so nobody can change what they pay.
//
// Setup (Cloudflare dashboard > Workers & Pages > Create > Worker):
//   1. Paste this file in as the Worker's code and deploy.
//   2. Settings > Variables and secrets > add secret STRIPE_SECRET_KEY (sk_live_... or sk_test_...).
//   3. Optional: add a route so it answers at https://putrika.net/api/checkout*
//      (otherwise use its workers.dev address in the site's SHOP_API setting).

const ALLOWED_ORIGINS = ['https://putrika.net', 'https://www.putrika.net'];
const RETURN_URL = 'https://putrika.net/?order={CHECKOUT_SESSION_ID}#shop';

// id: { name, price in cents (AUD), size: 'letter' fits a large letter, 'parcel' needs a satchel }
const PRODUCTS = {
  'magnet-wildflower': { name: 'Wildflower bunch fridge magnet', price: 1500, size: 'letter', max: 10 },
  'tote-celestial': { name: 'Celestial tote bag', price: 3500, size: 'parcel', max: 5 },
};

// Australia Post, posted by Karina. Cents (AUD).
const SHIPPING = {
  letter: { name: 'Australia Post large letter', amount: 600, min: 3, max: 8 },
  parcel: { name: 'Australia Post satchel', amount: 1400, min: 2, max: 7 },
};

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin || '');
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, origin);
    if (!env.STRIPE_SECRET_KEY) return json({ error: 'Shop is not set up yet' }, 503, origin);

    let cart;
    try { cart = (await request.json()).items; } catch { return json({ error: 'Bad request' }, 400, origin); }
    if (!Array.isArray(cart) || !cart.length) return json({ error: 'Cart is empty' }, 400, origin);

    const form = new URLSearchParams();
    form.set('ui_mode', 'embedded');
    form.set('mode', 'payment');
    form.set('return_url', RETURN_URL);
    form.set('shipping_address_collection[allowed_countries][0]', 'AU');
    form.set('phone_number_collection[enabled]', 'false');

    let i = 0, needsParcel = false;
    for (const item of cart.slice(0, 20)) {
      const p = PRODUCTS[item && item.id];
      const qty = Math.floor(Number(item && item.qty));
      if (!p || !(qty >= 1)) return json({ error: 'Unknown item' }, 400, origin);
      if (qty > p.max) return json({ error: 'Too many of one item' }, 400, origin);
      if (p.size === 'parcel') needsParcel = true;
      form.set(`line_items[${i}][quantity]`, String(qty));
      form.set(`line_items[${i}][price_data][currency]`, 'aud');
      form.set(`line_items[${i}][price_data][unit_amount]`, String(p.price));
      form.set(`line_items[${i}][price_data][product_data][name]`, p.name);
      i++;
    }

    const ship = SHIPPING[needsParcel ? 'parcel' : 'letter'];
    form.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
    form.set('shipping_options[0][shipping_rate_data][display_name]', ship.name);
    form.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(ship.amount));
    form.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'aud');
    form.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][unit]', 'business_day');
    form.set('shipping_options[0][shipping_rate_data][delivery_estimate][minimum][value]', String(ship.min));
    form.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][unit]', 'business_day');
    form.set('shipping_options[0][shipping_rate_data][delivery_estimate][maximum][value]', String(ship.max));

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const s = await r.json();
    if (!r.ok) return json({ error: (s.error && s.error.message) || 'Stripe error' }, 502, origin);
    return json({ clientSecret: s.client_secret }, 200, origin);
  },
};
