import http from "k6/http";
import { sleep } from "k6";

const BASE_URL = "http://localhost:3000";

export const options = { vus: 1, iterations: 1 };

export default function () {
  const jar = http.cookieJar();

  const loginRes = http.post(
    `${BASE_URL}/api/trpc/auth.login`,
    JSON.stringify({ json: { curp: "PWTS900101HDF00201", password: "LoadTest12345" } }),
    { headers: { "Content-Type": "application/json" } },
  );
  console.log("login status:", loginRes.status);
  console.log("login set-cookie header:", loginRes.headers["Set-Cookie"]);

  const cookiesForUrl = jar.cookiesForURL(BASE_URL);
  console.log("cookies en jar para BASE_URL:", JSON.stringify(cookiesForUrl));

  for (let i = 0; i < 5; i++) {
    const res = http.get(`${BASE_URL}/api/trpc/perfil.obtener`);
    console.log(`lectura ${i} status:`, res.status);
    sleep(1);
  }
}
