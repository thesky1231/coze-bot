import { SignJWT } from "jose";
import crypto from "node:crypto";

const TOKEN_ENDPOINT = "https://api.coze.cn/api/permission/oauth2/token";
const UID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function buildHeaders(extraHeaders = {}) {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  };
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: buildHeaders(),
    body: JSON.stringify(payload)
  };
}

function normalizePrivateKey(privateKeyValue) {
  return privateKeyValue.replace(/\\n/g, "\n").trim();
}

function validateUid(uid) {
  if (!uid) {
    return "缺少必填参数 uid。";
  }

  if (!UID_PATTERN.test(uid)) {
    return "uid 仅支持字母、数字、下划线和中划线，长度不超过 64。";
  }

  return null;
}

async function buildAssertion({
  clientId,
  privateKeyPem,
  publicKeyId,
  uid
}) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 300;
  const privateKey = crypto.createPrivateKey({
    key: privateKeyPem,
    format: "pem"
  });

  const jwt = new SignJWT({
    iss: clientId,
    sub: clientId,
    aud: TOKEN_ENDPOINT,
    iat,
    exp,
    jti: crypto.randomUUID(),
    session_name: uid
  }).setProtectedHeader({
    alg: "RS256",
    typ: "JWT",
    ...(publicKeyId ? { kid: publicKeyId } : {})
  });

  return jwt.sign(privateKey);
}

function parseUpstreamPayload(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function handler(event) {
  const method = event.httpMethod || "GET";

  if (method !== "GET") {
    return jsonResponse(405, {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "仅支持 GET 请求。"
      }
    });
  }

  const clientId = process.env.COZE_CLIENT_ID;
  const privateKeyEnv = process.env.COZE_PRIVATE_KEY;
  const publicKeyId = process.env.COZE_PUBLIC_KEY_ID || "";
  const uid = event.queryStringParameters?.uid?.trim() || "";

  const uidError = validateUid(uid);
  if (uidError) {
    return jsonResponse(400, {
      error: {
        code: "INVALID_UID",
        message: uidError
      }
    });
  }

  if (!clientId || !privateKeyEnv) {
    return jsonResponse(500, {
      error: {
        code: "MISSING_ENV",
        message: "服务端缺少必要环境变量，请检查 COZE_CLIENT_ID 和 COZE_PRIVATE_KEY。"
      }
    });
  }

  try {
    const assertion = await buildAssertion({
      clientId,
      privateKeyPem: normalizePrivateKey(privateKeyEnv),
      publicKeyId,
      uid
    });

    const upstreamResponse = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      })
    });

    const upstreamText = await upstreamResponse.text();
    const upstreamPayload = parseUpstreamPayload(upstreamText);

    if (!upstreamResponse.ok) {
      return jsonResponse(502, {
        error: {
          code: "COZE_TOKEN_REQUEST_FAILED",
          message: "Coze token 接口返回异常。",
          details: {
            status: upstreamResponse.status,
            status_text: upstreamResponse.statusText,
            upstream: upstreamPayload
          }
        }
      });
    }

    const accessToken =
      upstreamPayload.access_token ||
      upstreamPayload.token ||
      upstreamPayload.data?.access_token ||
      "";

    if (!accessToken) {
      return jsonResponse(502, {
        error: {
          code: "TOKEN_MISSING",
          message: "Coze token 接口响应成功，但未返回 access_token。",
          details: upstreamPayload
        }
      });
    }

    return jsonResponse(200, {
      token: accessToken,
      uid
    });
  } catch (error) {
    return jsonResponse(500, {
      error: {
        code: "INTERNAL_ERROR",
        message: "服务端生成 Coze token 时发生异常。",
        details: {
          name: error?.name || "Error",
          message: error?.message || "Unknown error"
        }
      }
    });
  }
}
