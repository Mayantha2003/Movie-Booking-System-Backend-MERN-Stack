import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import { RevokedToken } from "../models/revokedToken.model";

export interface RevocableToken {
  hash: string;
  expiresAt: Date;
  subject: string;
}

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const isTokenRevoked = async (token: string): Promise<boolean> =>
  Boolean(await RevokedToken.exists({ tokenHash: hashToken(token) }));

export const getRevocableToken = (
  token: string,
  secret: string
): RevocableToken | null => {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch {
    return null;
  }

  if (
    typeof payload === "string" ||
    typeof payload.sub !== "string" ||
    !Number.isSafeInteger(payload.exp)
  ) {
    return null;
  }

  return {
    hash: hashToken(token),
    expiresAt: new Date(payload.exp! * 1000),
    subject: payload.sub,
  };
};

export const revokeToken = async (
  token: RevocableToken
): Promise<void> => {
  try {
    await RevokedToken.updateOne(
      { tokenHash: token.hash },
      { $setOnInsert: { tokenHash: token.hash, expiresAt: token.expiresAt } },
      { upsert: true }
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return;
    }
    throw error;
  }
};
