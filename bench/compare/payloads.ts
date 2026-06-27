export const smallObject = {
  userId: "123",
  route: "/login",
};

export const mediumObject = {
  userId: "123",
  route: "/login",
  method: "POST",
  status: 200,
  durationMs: 12,
  ip: "127.0.0.1",
};

export const largeObject = {
  userId: "123",
  route: "/checkout",
  method: "POST",
  status: 201,
  durationMs: 48,
  ip: "127.0.0.1",
  requestId: "req-abc-123",
  sessionId: "sess-xyz-789",
  cart: {
    items: [
      { sku: "book-1", quantity: 2, price: 19.99 },
      { sku: "pen-4", quantity: 5, price: 2.5 },
      { sku: "bag-2", quantity: 1, price: 39.5 },
    ],
    total: 92.98,
    currency: "USD",
  },
  flags: {
    authenticated: true,
    betaUser: false,
    retry: false,
  },
  tags: ["benchmark", "structured", "logging"],
};

export const userObject = {
  id: "123",
  email: "user@example.test",
  role: "admin",
};

export const requestLikeObject = {
  reqId: "req-123",
  method: "POST",
  url: "/login",
  headers: {
    host: "example.test",
    "user-agent": "pequi-bench",
    accept: "application/json",
  },
  remoteAddress: "127.0.0.1",
  remotePort: 53421,
};

export const errorObject = new Error("boom");

export const redactionObject = {
  userId: "123",
  password: "secret",
  token: "abc",
  nested: { password: "secret" },
};

export const serializerObject = {
  id: "123",
  email: "user@example.test",
  password: "secret",
};

export const formatArgs = {
  hello: ["hello %s", "world"] as const,
  request: ["request %s completed in %dms", "/login", 12] as const,
};
