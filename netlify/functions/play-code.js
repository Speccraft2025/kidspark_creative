// POST /api/play-code  { code }  ->  { ok: true } | 400 { ok: false, error }
// Checks a Babotap play code. Codes are signed, so no database lookup is needed.
const { json } = require('./_shared/lib');
const { verifyPlayCode } = require('./_shared/playcode');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });
  let code = '';
  try { code = (JSON.parse(event.body || '{}').code || '').toString().slice(0, 40); } catch (e) {}
  try {
    if (verifyPlayCode(code)) return json(200, { ok: true });
  } catch (e) {
    console.error('play-code check failed:', e);
    return json(500, { ok: false, error: 'We could not check the code right now. Please try again.' });
  }
  return json(400, { ok: false, error: 'That play code did not work. Check it and try again.' });
};
