import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = "http://localhost:3000";

export const options = {
  scenarios: {
    login_burst: {
      executor: "ramping-arrival-rate",
      startRate: 0,
      timeUnit: "1s",
      preAllocatedVUs: 100,
      maxVUs: 300,
      stages: [{ target: 8, duration: "10s" }, { target: 0, duration: "2s" }],
      exec: "login",
    },
    dashboard_reads: {
      executor: "constant-vus",
      vus: 20,
      duration: "10s",
      exec: "readDashboard",
    },
  },
};

const statusCounts = {};
function tally(prefix, status) {
  const key = `${prefix}:${status}`;
  statusCounts[key] = (statusCounts[key] || 0) + 1;
}

export function login() {
  const idx = Math.floor(Math.random() * 300);
  const curp = `PWTS900101HDF${String(idx).padStart(3, "0")}01`;
  const res = http.post(
    `${BASE_URL}/api/trpc/auth.login`,
    JSON.stringify({ json: { curp, password: "LoadTest12345" } }),
    { headers: { "Content-Type": "application/json" } },
  );
  tally("login", res.status);
  if (res.status !== 200) {
    console.log("login fallo:", res.status, res.body ? res.body.slice(0, 200) : "");
  }
  sleep(1);
}

let sesionEstablecida = false;

export function readDashboard() {
  if (!sesionEstablecida) {
    const idx = (__VU - 1) % 300;
    const curp = `PWTS900101HDF${String(idx).padStart(3, "0")}01`;
    const loginRes = http.post(
      `${BASE_URL}/api/trpc/auth.login`,
      JSON.stringify({ json: { curp, password: "LoadTest12345" } }),
      { headers: { "Content-Type": "application/json" } },
    );
    tally("dashLogin", loginRes.status);
    if (loginRes.status === 200) {
      sesionEstablecida = true;
    } else {
      console.log("dashLogin fallo:", loginRes.status, loginRes.body ? loginRes.body.slice(0, 200) : "");
      sleep(1);
      return;
    }
  }
  const res = http.get(`${BASE_URL}/api/trpc/perfil.obtener`);
  tally("portal", res.status);
  if (res.status !== 200) {
    console.log("portal fallo:", res.status, res.body ? res.body.slice(0, 200) : "");
  }
  sleep(1);
}

export function teardown() {
  console.log("STATUS COUNTS:", JSON.stringify(statusCounts));
}
