import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import test from "node:test";
import { createServer } from "node:http";
import paymentRoutes from "../src/routes/payment.routes";

test("notify route parses PayHere form encoding before signature verification", async (t) => {
  const keys = [
    "PAYHERE_MODE",
    "PAYHERE_MERCHANT_ID",
    "PAYHERE_MERCHANT_SECRET",
    "BACKEND_PUBLIC_URL",
    "FRONTEND_URL",
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.PAYHERE_MODE = "sandbox";
  process.env.PAYHERE_MERCHANT_ID = "merchant-test";
  process.env.PAYHERE_MERCHANT_SECRET = "secret-test";
  process.env.BACKEND_PUBLIC_URL = "https://backend.example.test";
  process.env.FRONTEND_URL = "https://frontend.example.test";
  t.after(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const app = express();
  app.use("/api/payments", paymentRoutes);
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/payments/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        merchant_id: "merchant-test",
        order_id: "PH-BK-ABC234-1",
        payment_id: "payment-1",
        payhere_amount: "1250.00",
        payhere_currency: "LKR",
        status_code: "2",
        md5sig: "0".repeat(32),
      }),
    });

    assert.equal(response.status, 400);
    assert.equal(await response.text(), "Invalid signature");
  } finally {
    server.close();
    await once(server, "close");
  }
});
