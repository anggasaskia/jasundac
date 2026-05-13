const https = require("https");
const { Wallet } = require("ethers");

const PRIVATE_KEYS = [
    "Private key 1",
    "Private key 2",
    "Private key 3"
    // dst sesuai kbutuhan (stiap nambah private key dikasih koma yaa wek)
];

const CLAIM_COUNT    = 5;
const DELAY_CLAIM_MS = 10000;
const DELAY_AKUN_MS  = 60000;

const BASE_HOST = "inception.dachain.io";
const BASE_URL  = `https://${BASE_HOST}`;

function request(method, path, { headers = {}, body = null, cookies = {} } = {}) {
  return new Promise((resolve, reject) => {
    const cookieStr = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    const bodyStr = body ? JSON.stringify(body) : null;

    const reqHeaders = {
      accept: "*/*",
      "accept-encoding": "gzip, deflate, br, zstd",
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "content-type": "application/json",
      origin: BASE_URL,
      referer: BASE_URL + "/",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent":
        "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
      ...(cookieStr ? { cookie: cookieStr } : {}),
      ...(bodyStr ? { "content-length": Buffer.byteLength(bodyStr) } : {}),
      ...headers,
    };

    const options = { hostname: BASE_HOST, path, method, headers: reqHeaders };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        const setCookies = {};
        for (const c of res.headers["set-cookie"] || []) {
          const [pair] = c.split(";");
          const eqIdx = pair.indexOf("=");
          if (eqIdx > -1) {
            const k = pair.slice(0, eqIdx).trim();
            const v = pair.slice(eqIdx + 1).trim();
            setCookies[k] = v;
          }
        }
        resolve({ status: res.statusCode, headers: res.headers, cookies: setCookies, body: raw });
      });
    });

    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function prosesAkun(privateKey, index, total) {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Akun ${index}/${total}`);

  let wallet;
  try {
    wallet = new Wallet(privateKey);
  } catch (e) {
    console.error(`❌ Private key tidak valid: ${e.message}`);
    return { berhasil: 0, gagal: CLAIM_COUNT };
  }
  console.log(`🔑 Address : ${wallet.address}`);

  
  const csrfRes = await request("GET", "/csrf/");
  let csrftoken = csrfRes.cookies["csrftoken"];

  if (!csrftoken) {
    console.error("❌ Gagal mendapatkan CSRF token");
    return { berhasil: 0, gagal: CLAIM_COUNT };
  }
  console.log(`✅ CSRF     : ${csrftoken.slice(0, 10)}...`);
  let cookies = { csrftoken };

  
  const loginRes = await request("POST", "/api/auth/wallet/", {
    headers: { "x-csrftoken": csrftoken },
    body: { wallet_address: wallet.address },
    cookies,
  });

  if (loginRes.status !== 200) {
    console.error(`❌ Login gagal (${loginRes.status}):`, loginRes.body);
    return { berhasil: 0, gagal: CLAIM_COUNT };
  }

  cookies = { ...cookies, ...loginRes.cookies };
  if (loginRes.cookies["csrftoken"]) {
    cookies["csrftoken"] = loginRes.cookies["csrftoken"];
  }
  console.log(`✅ Login OK`);

  
  let berhasil = 0;
  let gagal    = 0;

  for (let i = 1; i <= CLAIM_COUNT; i++) {
    process.stdout.write(`   Claim #${i}/${CLAIM_COUNT}... `);

    try {
      const claimRes = await request("POST", "/api/inception/crate/open/", {
        headers: { "x-csrftoken": cookies["csrftoken"] },
        cookies,
      });

      cookies = { ...cookies, ...claimRes.cookies };
      if (claimRes.cookies["csrftoken"]) {
        cookies["csrftoken"] = claimRes.cookies["csrftoken"];
      }

      if (claimRes.status === 200) {
        console.log(`✅ Berhasil`);
        try {
          const d = JSON.parse(claimRes.body);
          console.log("      →", JSON.stringify(d));
        } catch (_) {}
        berhasil++;
      } else {
        console.log(`❌ Gagal`);
        gagal++;
      }
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
      gagal++;
    }

    if (i < CLAIM_COUNT) await sleep(DELAY_CLAIM_MS);
  }

  return { berhasil, gagal };
}

async function main() {
  console.log("=== Dachain Multi-Account Crate Claimer ===");
  console.log(`Total akun  : ${PRIVATE_KEYS.length}`);
  console.log(`Claim/akun  : ${CLAIM_COUNT}x`);
  console.log(`Total claim : ${PRIVATE_KEYS.length * CLAIM_COUNT}x`);

  const hasil = [];

  for (let i = 0; i < PRIVATE_KEYS.length; i++) {
    const result = await prosesAkun(PRIVATE_KEYS[i], i + 1, PRIVATE_KEYS.length);
    hasil.push(result);

    
    if (i < PRIVATE_KEYS.length - 1) {
      console.log(`\n⏳ Jeda ${DELAY_AKUN_MS / 1000} detik sebelum akun berikutnya...`);
      await sleep(DELAY_AKUN_MS);
    }
  }

  // Rekap total
  const totalBerhasil = hasil.reduce((s, r) => s + r.berhasil, 0);
  const totalGagal    = hasil.reduce((s, r) => s + r.gagal, 0);

  console.log(`\n${"═".repeat(50)}`);
  console.log("=== REKAP TOTAL ===");
  hasil.forEach((r, i) => {
    console.log(`  Akun ${i + 1}: ✅ ${r.berhasil}/${CLAIM_COUNT} berhasil`);
  });
  console.log(`─────────────────────`);
  console.log(`  Total ✅ : ${totalBerhasil}`);
  console.log(`  Total ❌ : ${totalGagal}`);
  console.log(`${"═".repeat(50)}`);
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err.message);
  process.exit(1);
});