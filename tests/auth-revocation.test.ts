import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { getRefreshToken, logout } from "../src/controllers/auth.controller";
import {
  authenticate,
  type AuthRequest,
} from "../src/middleware/auth";
import { optionalAuthenticate } from "../src/middleware/optionalauth";
import { restrictTo } from "../src/middleware/restrictTo";
import { UserModel, UserRole, UserStatus } from "../src/models/user.model";
import { RevokedToken } from "../src/models/revokedToken.model";
import { hashToken } from "../src/services/tokenRevocation.service";

interface TestAccount {
  _id: Types.ObjectId;
  username: string;
  user_role: UserRole;
  user_status: UserStatus;
}

const replacements = new WeakMap<
  TestContext,
  Map<string, PropertyDescriptor | undefined>
>();

const replace = (
  context: TestContext,
  target: object,
  name: string,
  implementation: (...args: any[]) => any
): void => {
  let descriptors = replacements.get(context);
  if (!descriptors) {
    descriptors = new Map();
    replacements.set(context, descriptors);
  }

  const key = `${name}`;
  if (!descriptors.has(key)) {
    const original = Object.getOwnPropertyDescriptor(target, name);
    descriptors.set(key, original);
    context.after(() => {
      if (original) Object.defineProperty(target, name, original);
      else delete (target as Record<string, unknown>)[name];
    });
  }

  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value: implementation,
  });
};

const accountQuery = (account: TestAccount | null) => {
  const query = {
    select: () => query,
    lean: () => Promise.resolve(account),
    then: (
      resolve: (value: TestAccount | null) => unknown,
      reject: (error: unknown) => unknown
    ) => Promise.resolve(account).then(resolve, reject),
  };
  return query;
};

const mockAccountLookup = (
  context: TestContext,
  account: TestAccount | null
): void => {
  replace(context, UserModel, "findById", () => accountQuery(account));
  replace(context, RevokedToken, "exists", async () => null);
};

const createAccount = (
  role: UserRole,
  status = UserStatus.ACTIVE
): TestAccount => ({
  _id: new Types.ObjectId(),
  username: "test-account",
  user_role: role,
  user_status: status,
});

const createToken = (
  account: TestAccount,
  kind: "access" | "refresh" = "access"
): string =>
  jwt.sign(
    kind === "access"
      ? {
          sub: account._id.toString(),
          role: account.user_role,
          username: account.username,
        }
      : { sub: account._id.toString() },
    kind === "access"
      ? (process.env.JWT_SECRET as string)
      : (process.env.JWT_REFRESH_SECRET as string),
    { expiresIn: kind === "access" ? "30m" : "7d" }
  );

const response = () => {
  const result: { statusCode: number; body?: unknown } = { statusCode: 200 };
  return Object.assign(result, {
    status(statusCode: number) {
      result.statusCode = statusCode;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  });
};

const invokeAuth = async (
  middleware: typeof authenticate | typeof optionalAuthenticate,
  token: string
) => {
  const req = {
    headers: { authorization: `Bearer ${token}` },
  } as AuthRequest;
  const res = response();
  let nextCalled = false;
  await middleware(req, res as any, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
};

test("active user token is authenticated and current admin roles remain authorized", async (t) => {
  const admin = createAccount(UserRole.ADMIN);
  mockAccountLookup(t, admin);

  const adminResult = await invokeAuth(authenticate, createToken(admin));
  assert.equal(adminResult.res.statusCode, 200);
  assert.equal(adminResult.nextCalled, true);
  assert.equal(adminResult.req.user.role, UserRole.ADMIN);

  let adminAuthorized = false;
  restrictTo(UserRole.ADMIN)(
    adminResult.req,
    adminResult.res as any,
    () => {
      adminAuthorized = true;
    }
  );
  assert.equal(adminAuthorized, true);

  const superAdmin = createAccount(UserRole.SUPER_ADMIN);
  mockAccountLookup(t, superAdmin);
  const superAdminResult = await invokeAuth(
    authenticate,
    createToken(superAdmin)
  );
  let superAdminAuthorized = false;
  restrictTo(UserRole.SUPER_ADMIN)(
    superAdminResult.req,
    superAdminResult.res as any,
    () => {
      superAdminAuthorized = true;
    }
  );
  assert.equal(superAdminResult.nextCalled, true);
  assert.equal(superAdminAuthorized, true);
});

test("a blocked account's previously issued access token is rejected", async (t) => {
  const oldAccount = createAccount(UserRole.USER);
  mockAccountLookup(t, { ...oldAccount, user_status: UserStatus.BLOCKED });

  const result = await invokeAuth(authenticate, createToken(oldAccount));
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.deepEqual(result.res.body, { message: "Invalid or Expired Token!" });
});

test("a revoked access token is rejected even when its account is active", async (t) => {
  const account = createAccount(UserRole.USER);
  mockAccountLookup(t, account);
  replace(t, RevokedToken, "exists", async () => ({ _id: new Types.ObjectId() }));

  const result = await invokeAuth(authenticate, createToken(account));
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.nextCalled, false);
});

test("a deleted account's previously issued access token is rejected", async (t) => {
  const oldAccount = createAccount(UserRole.USER);
  mockAccountLookup(t, null);

  const result = await invokeAuth(authenticate, createToken(oldAccount));
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.deepEqual(result.res.body, { message: "Invalid or Expired Token!" });
});

test("an access token with a stale role is rejected", async (t) => {
  const oldAccount = createAccount(UserRole.USER);
  mockAccountLookup(t, { ...oldAccount, user_role: UserRole.ADMIN });

  const result = await invokeAuth(authenticate, createToken(oldAccount));
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.nextCalled, false);
});

test("refresh issues access using the account's current role", async (t) => {
  const account = createAccount(UserRole.USER);
  mockAccountLookup(t, { ...account, user_role: UserRole.ADMIN });
  const res = response();

  await getRefreshToken(
    { body: { refreshToken: createToken(account, "refresh") } } as any,
    res as any
  );

  assert.equal(res.statusCode, 200);
  const data = res.body as {
    data: { access_token: string };
  };
  const accessToken = jwt.decode(data.data.access_token) as jwt.JwtPayload;
  assert.equal(accessToken.role, UserRole.ADMIN);
});

test("refresh rejects tokens for blocked and deleted accounts", async (t) => {
  const blocked = createAccount(UserRole.USER, UserStatus.BLOCKED);
  mockAccountLookup(t, blocked);
  const blockedResponse = response();
  await getRefreshToken(
    { body: { refreshToken: createToken(blocked, "refresh") } } as any,
    blockedResponse as any
  );
  assert.equal(blockedResponse.statusCode, 403);
  assert.deepEqual(blockedResponse.body, { message: "Invalid or expired token!" });

  const deleted = createAccount(UserRole.USER);
  mockAccountLookup(t, null);
  const deletedResponse = response();
  await getRefreshToken(
    { body: { refreshToken: createToken(deleted, "refresh") } } as any,
    deletedResponse as any
  );
  assert.equal(deletedResponse.statusCode, 403);
  assert.deepEqual(deletedResponse.body, blockedResponse.body);
});

test("refresh rejects a revoked refresh token", async (t) => {
  const account = createAccount(UserRole.USER);
  mockAccountLookup(t, account);
  replace(t, RevokedToken, "exists", async () => ({ _id: new Types.ObjectId() }));
  const res = response();

  await getRefreshToken(
    { body: { refreshToken: createToken(account, "refresh") } } as any,
    res as any
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Invalid or expired token!" });
});

test("logout stores hashes for the current access and refresh tokens", async (t) => {
  const account = createAccount(UserRole.USER);
  const accessToken = createToken(account);
  const refreshToken = createToken(account, "refresh");
  const updates: Array<{ filter: any; update: any; options: any }> = [];
  replace(
    t,
    RevokedToken,
    "updateOne",
    async (filter: any, update: any, options: any) => {
      updates.push({ filter, update, options });
      return { acknowledged: true };
    }
  );
  const res = response();

  await logout(
    {
      headers: { authorization: `Bearer ${accessToken}` },
      body: { refreshToken },
    } as any,
    res as any
  );

  assert.equal(res.statusCode, 204);
  assert.equal(updates.length, 2);
  assert.deepEqual(
    updates.map(({ filter }) => filter.tokenHash).sort(),
    [hashToken(accessToken), hashToken(refreshToken)].sort()
  );
  assert.equal(updates.every(({ options }) => options.upsert), true);
  assert.equal(updates.some(({ update }) =>
    JSON.stringify(update).includes(accessToken) ||
    JSON.stringify(update).includes(refreshToken)
  ), false);
});

test("optional authentication rejects a blocked account token", async (t) => {
  const oldAccount = createAccount(UserRole.USER);
  mockAccountLookup(t, { ...oldAccount, user_status: UserStatus.BLOCKED });

  const result = await invokeAuth(
    optionalAuthenticate,
    createToken(oldAccount)
  );
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.nextCalled, false);
});
