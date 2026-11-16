import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { createAdmin, login, register } from "../src/controllers/auth.controller";
import { createUser } from "../src/controllers/admin.controller";
import { UserModel, UserRole, UserStatus } from "../src/models/user.model";

const replacements = new WeakMap<
  TestContext,
  WeakMap<object, Map<string, PropertyDescriptor | undefined>>
>();

const replace = (
  context: TestContext,
  target: object,
  name: string,
  implementation: (...args: any[]) => any
): void => {
  let targets = replacements.get(context);
  if (!targets) {
    targets = new WeakMap();
    replacements.set(context, targets);
  }
  let names = targets.get(target);
  if (!names) {
    names = new Map();
    targets.set(target, names);
  }
  if (!names.has(name)) {
    const original = Object.getOwnPropertyDescriptor(target, name);
    names.set(name, original);
    context.after(() => {
      if (original) Object.defineProperty(target, name, original);
      else delete (target as any)[name];
    });
  }
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value: implementation,
  });
};

const response = () => {
  const result: any = { statusCode: 200, body: undefined };
  result.status = (statusCode: number) => {
    result.statusCode = statusCode;
    return result;
  };
  result.json = (body: unknown) => {
    result.body = body;
    return result;
  };
  return result;
};

const validInput = () => ({
  first_name: "Test",
  last_name: "User",
  username: "testuser",
  email: "  TEST@example.test  ",
  phone: "0771234567",
  password: "SecurePass123",
});

test("register accepts valid account data, normalizes email, and never returns the password hash", async (t) => {
  let saved: any;
  replace(t, UserModel, "findOne", async () => null);
  replace(t, UserModel.prototype, "save", async function (this: any) {
    saved = this;
    return this;
  });

  const input = { ...validInput(), password: " SecurePass123 " };
  const res = response();
  await register({ body: input } as any, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { message: "User registered successfully!" });
  assert.equal(saved.email, "test@example.test");
  assert.equal(saved.first_name, "Test");
  assert.equal(await bcrypt.compare(input.password, saved.password), true);
  assert.equal(await bcrypt.compare("SecurePass123", saved.password), false);
  assert.equal("password" in res.body, false);
  assert.equal("passwordHash" in res.body, false);
});

test("registration rejects invalid account inputs before database reads or writes", async (t) => {
  let databaseCalls = 0;
  replace(t, UserModel, "findOne", async () => {
    databaseCalls += 1;
    return null;
  });
  replace(t, UserModel.prototype, "save", async () => {
    databaseCalls += 1;
  });

  const cases: Array<[string, Record<string, unknown>]> = [
    ["invalid email format", { ...validInput(), email: "not-an-email" }],
    ["missing email", (() => {
      const input = validInput();
      const { email: _email, ...rest } = input;
      return rest;
    })()],
    ["empty email", { ...validInput(), email: "   " }],
    ["non-string email", { ...validInput(), email: { $ne: null } }],
    ["missing password", (() => {
      const input = validInput();
      const { password: _password, ...rest } = input;
      return rest;
    })()],
    ["empty password", { ...validInput(), password: "" }],
    ["short password", { ...validInput(), password: "Abc123" }],
    ["weak password", { ...validInput(), password: "passwordonly" }],
    ["non-string password", { ...validInput(), password: ["SecurePass123"] }],
    ["non-string username", { ...validInput(), username: { $gt: "" } }],
    ["unexpected role field", { ...validInput(), user_role: UserRole.SUPER_ADMIN }],
  ];

  for (const [label, body] of cases) {
    const res = response();
    await register({ body } as any, res);
    assert.equal(res.statusCode, 400, label);
    assert.equal(typeof res.body.message, "string", label);
  }
  assert.equal(databaseCalls, 0);
});

test("registration rejects case-insensitive duplicate email without writing", async (t) => {
  let query: any;
  let saved = false;
  replace(t, UserModel, "findOne", async (filter: unknown) => {
    query = filter;
    return { _id: new Types.ObjectId() };
  });
  replace(t, UserModel.prototype, "save", async () => {
    saved = true;
  });

  const res = response();
  await register({ body: validInput() } as any, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { message: "Username or email is already in use." });
  assert.deepEqual(query, {
    $or: [
      { username: "testuser" },
      { email: { $regex: "^test@example\\.test$", $options: "i" } },
    ],
  });
  assert.equal(saved, false);
});

test("admin creation validates inputs, normalizes email, hashes password, and returns only safe fields", async (t) => {
  let created: any;
  replace(t, UserModel, "findOne", async () => null);
  replace(t, UserModel, "create", async (document: unknown) => {
    created = document;
    return { ...document as object, _id: new Types.ObjectId() };
  });

  const res = response();
  await createAdmin({ body: validInput() } as any, res);

  assert.equal(res.statusCode, 201);
  assert.equal(created.email, "test@example.test");
  assert.equal(created.user_role, UserRole.ADMIN);
  assert.equal(await bcrypt.compare("SecurePass123", created.password), true);
  assert.equal("password" in res.body.data, false);
  assert.equal("passwordHash" in res.body.data, false);
});

test("admin creation rejects malformed or duplicate account data", async (t) => {
  let databaseCalls = 0;
  replace(t, UserModel, "findOne", async () => {
    databaseCalls += 1;
    return null;
  });
  replace(t, UserModel, "create", async () => {
    databaseCalls += 1;
  });

  const invalidResponse = response();
  await createAdmin(
    { body: { ...validInput(), email: "bad", password: "weak" } } as any,
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(databaseCalls, 0);

  replace(t, UserModel, "findOne", async () => ({ _id: new Types.ObjectId() }));
  const duplicateResponse = response();
  await createAdmin({ body: validInput() } as any, duplicateResponse);
  assert.equal(duplicateResponse.statusCode, 409);
});

test("admin-created customer accounts use the same normalized email and password validation", async (t) => {
  let created: any;
  replace(t, UserModel, "findOne", async () => null);
  replace(t, UserModel, "create", async (document: unknown) => {
    created = document;
    return { ...document as object, _id: new Types.ObjectId() };
  });
  replace(t, UserModel, "findById", () => ({
    select: async () => ({ _id: created._id, email: created.email }),
  }));

  const res = response();
  await createUser({ body: validInput() } as any, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created.email, "test@example.test");
  assert.equal(await bcrypt.compare("SecurePass123", created.password), true);

  const invalidRes = response();
  const input = validInput();
  const { email: _email, ...withoutEmail } = input;
  await createUser({ body: withoutEmail } as any, invalidRes);
  assert.equal(invalidRes.statusCode, 400);
});

test("existing account login continues to accept its stored password hash", async (t) => {
  const password = "ExistingPassword123";
  const user = {
    _id: new Types.ObjectId(),
    first_name: "Existing",
    last_name: "User",
    username: "existing",
    user_role: UserRole.USER,
    user_status: UserStatus.ACTIVE,
    password: await bcrypt.hash(password, 10),
  };
  replace(t, UserModel, "findOne", async () => user);

  const res = response();
  await login({ body: { username: "existing", password } } as any, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.username, "existing");
  assert.equal(typeof res.body.data.access_token, "string");
  assert.equal(typeof res.body.data.refresh_token, "string");
  assert.equal("password" in res.body.data, false);
});
