const https = require("https");
const { Wallet } = require("ethers");

const PRIVATE_KEYS = [
// isi privatekey disini
// contoh : "akdjahkdjhakjdhas",
            // "AJKDHAKJDHADSADNA"   
]

const CLAIM_CRATE_COUNT = 5;
const DELAY_CLAIM_MS = 2000;
const DELAY_AKUN_MS = 5000;

const BASE_HOST = "inception.dachain.io";
const BASE_URL = `https://${BASE_HOST}`;

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
      "user-agent":
        "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
      ...(cookieStr ? { cookie: cookieStr } : {}),
      ...(bodyStr ? { "content-length": Buffer.byteLength(bodyStr) } : {}),
      ...headers,
    };

    const options = {
      hostname: BASE_HOST,
      path,
      method,
      headers: reqHeaders,
    };

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

        let parsed = null;

        try {
          parsed = JSON.parse(raw);
        } catch {}

        resolve({
          status: res.statusCode,
          headers: res.headers,
          cookies: setCookies,
          body: raw,
          json: parsed,
        });
      });
    });

    req.on("error", reject);

    if (bodyStr) req.write(bodyStr);

    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSuccess(res) {
  return (
    res.status === 200 ||
    res.status === 201 ||
    res.status === 202 ||
    (res.json &&
      (
        res.json.success === true ||
        res.json.status === "success" ||
        res.json.message?.toLowerCase().includes("success") ||
        res.json.message?.toLowerCase().includes("claimed") ||
        res.json.message?.toLowerCase().includes("already") ||
        res.json.message?.toLowerCase().includes("opened")
      ))
  );
}

async function login(wallet) {
  const csrfRes = await request("GET", "/csrf/");

  let cookies = {
    csrftoken: csrfRes.cookies.csrftoken,
  };

  if (!cookies.csrftoken) {
    throw new Error("CSRF token gagal");
  }

  const loginRes = await request("POST", "/api/auth/wallet/", {
    headers: {
      "x-csrftoken": cookies.csrftoken,
    },
    body: {
      wallet_address: wallet.address,
    },
    cookies,
  });

  cookies = {
    ...cookies,
    ...loginRes.cookies,
  };

  if (loginRes.status !== 200) {
    throw new Error(`Login gagal ${loginRes.status}`);
  }

  return cookies;
}

async function claimFaucet(cookies) {
  const faucetRes = await request("POST", "/api/inception/faucet/", {
    headers: {
      "x-csrftoken": cookies.csrftoken,
    },
    cookies,
  });

  cookies = {
    ...cookies,
    ...faucetRes.cookies,
  };

  const success = isSuccess(faucetRes);

  return {
    success,
    cookies,
    data: faucetRes.json || faucetRes.body,
  };
}

async function openCrate(cookies) {
  const crateRes = await request("POST", "/api/inception/crate/open/", {
    headers: {
      "x-csrftoken": cookies.csrftoken,
    },
    cookies,
  });

  cookies = {
    ...cookies,
    ...crateRes.cookies,
  };

  const success = isSuccess(crateRes);

  return {
    success,
    cookies,
    data: crateRes.json || crateRes.body,
  };
}

async function prosesAkun(privateKey, index, total) {
  console.log(`\n${"═".repeat(50)}`);
  console.log(`Akun ${index}/${total}`);

  let wallet;

  try {
    wallet = new Wallet(privateKey);
  } catch {
    console.log("❌ Private key invalid");

    return {
      faucetBerhasil: 0,
      faucetGagal: 1,
      crateBerhasil: 0,
      crateGagal: CLAIM_CRATE_COUNT,
    };
  }

  console.log(`🔑 ${wallet.address}`);

  try {
    let cookies = await login(wallet);

    console.log("✅ Login sukses");

    console.log("\n🚰 Faucet");

    const faucet = await claimFaucet(cookies);

    cookies = faucet.cookies;

    let faucetBerhasil = 0;
    let faucetGagal = 0;

    if (faucet.success) {
      faucetBerhasil++;

      console.log("✅ Faucet berhasil");

      if (typeof faucet.data === "object") {
        console.log(JSON.stringify(faucet.data));
      } else {
        console.log(faucet.data);
      }
    } else {
      faucetGagal++;

      console.log("❌ Faucet gagal");

      if (typeof faucet.data === "object") {
        console.log(JSON.stringify(faucet.data));
      } else {
        console.log(faucet.data);
      }
    }

    console.log("\n📦 Open Crate");

    let crateBerhasil = 0;
    let crateGagal = 0;

    for (let i = 0; i < CLAIM_CRATE_COUNT; i++) {
      console.log(`\n📦 Crate ${i + 1}/${CLAIM_CRATE_COUNT}`);

      const crate = await openCrate(cookies);

      cookies = crate.cookies;

if (crate.success) {
  crateBerhasil++;

  console.log("✅ Crate berhasil");

  if (typeof crate.data === "object") {
    console.log(JSON.stringify(crate.data));
  } else {
    console.log(crate.data);
  }
} else {
  crateGagal++;

  console.log("❌ Crate gagal");

  const msg =
    typeof crate.data === "object"
      ? JSON.stringify(crate.data)
      : String(crate.data);

  console.log(msg);

  if (
    msg.toLowerCase().includes("daily limit") ||
    msg.toLowerCase().includes("come back later") ||
    msg.toLowerCase().includes("limit reached") ||
    msg.toLowerCase().includes("24h")
  ) {
    console.log("⏭️ Skip ke akun berikutnya...");
    break;
  }
}
      if (i < CLAIM_CRATE_COUNT - 1) {
        console.log(`⏳ Delay ${DELAY_CLAIM_MS / 1000}s`);
        await sleep(DELAY_CLAIM_MS);
      }
    }

    return {
      faucetBerhasil,
      faucetGagal,
      crateBerhasil,
      crateGagal,
    };
  } catch (err) {
    console.log(`❌ Error akun: ${err.message}`);

    return {
      faucetBerhasil: 0,
      faucetGagal: 1,
      crateBerhasil: 0,
      crateGagal: CLAIM_CRATE_COUNT,
    };
  }
}

async function main() {
  console.log("=== Dachain Multi Account Bot ===");
  console.log(`Total akun : ${PRIVATE_KEYS.length}`);

  const hasil = [];

  for (let i = 0; i < PRIVATE_KEYS.length; i++) {
    const result = await prosesAkun(
      PRIVATE_KEYS[i],
      i + 1,
      PRIVATE_KEYS.length
    );

    hasil.push(result);

    if (i < PRIVATE_KEYS.length - 1) {
      console.log(`\n⏳ Delay akun ${DELAY_AKUN_MS / 1000}s`);
      await sleep(DELAY_AKUN_MS);
    }
  }

  const totalFaucetBerhasil = hasil.reduce(
    (a, b) => a + b.faucetBerhasil,
    0
  );

  const totalFaucetGagal = hasil.reduce(
    (a, b) => a + b.faucetGagal,
    0
  );

  const totalCrateBerhasil = hasil.reduce(
    (a, b) => a + b.crateBerhasil,
    0
  );

  const totalCrateGagal = hasil.reduce(
    (a, b) => a + b.crateGagal,
    0
  );

  console.log(`\n${"═".repeat(50)}`);
  console.log("=== REKAP TOTAL ===");

  hasil.forEach((r, i) => {
    console.log(
      `Akun ${i + 1} | Faucet ✅ ${r.faucetBerhasil} ❌ ${r.faucetGagal} | Crate ✅ ${r.crateBerhasil} ❌ ${r.crateGagal}`
    );
  });

  console.log("─────────────────────");
  console.log(`Faucet ✅ : ${totalFaucetBerhasil}`);
  console.log(`Faucet ❌ : ${totalFaucetGagal}`);
  console.log(`Crate  ✅ : ${totalCrateBerhasil}`);
  console.log(`Crate  ❌ : ${totalCrateGagal}`);
  console.log(`${"═".repeat(50)}`);
}

main().catch((err) => {
  console.log(`❌ Fatal: ${err.message}`);
});
