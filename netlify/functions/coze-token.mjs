import { SignJWT } from "jose";
import crypto from "node:crypto";

const TOKEN_ENDPOINT = "https://api.coze.cn/api/permission/oauth2/token";
const TOKEN_AUDIENCE = new URL(TOKEN_ENDPOINT).host;
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
  let normalized = privateKeyValue
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();

  if (!normalized) {
    return "";
  }

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  const pemMatch = normalized.match(
    /^-----BEGIN ([A-Z0-9 ]+)-----\s*([\s\S]+?)\s*-----END \1-----$/i
  );
  if (pemMatch) {
    const [, label, body] = pemMatch;
    const compactBody = body.replace(/\s+/g, "");
    const wrappedLines = compactBody.match(/.{1,64}/g) || [compactBody];
    return [
      `-----BEGIN ${label}-----`,
      ...wrappedLines,
      `-----END ${label}-----`
    ].join("\n");
  }

  // Some consoles only show the base64 body. Wrap it into a standard PEM block
  // so Node/OpenSSL can parse it as a PKCS#8 private key.
  const compact = normalized.replace(/\s+/g, "");
  if (/^[A-Za-z0-9+/=]+$/.test(compact) && compact.length > 128) {
    const wrappedLines = compact.match(/.{1,64}/g) || [compact];
    return [
      "-----BEGIN PRIVATE KEY-----",
      ...wrappedLines,
      "-----END PRIVATE KEY-----"
    ].join("\n");
  }

  return normalized;
}

function extractPemBody(privateKeyPem) {
  const pemMatch = privateKeyPem.match(
    /^-----BEGIN ([A-Z0-9 ]+)-----\s*([\s\S]+?)\s*-----END \1-----$/i
  );

  if (!pemMatch) {
    return "";
  }

  return pemMatch[2].replace(/[^A-Za-z0-9+/=]/g, "");
}

function createPrivateKeyObject(privateKeyPem) {
  try {
    return crypto.createPrivateKey({
      key: privateKeyPem,
      format: "pem"
    });
  } catch (pemError) {
    const compactBody = extractPemBody(privateKeyPem);
    if (!compactBody) {
      throw pemError;
    }

    const derBuffer = Buffer.from(compactBody, "base64");
    const derTypes = ["pkcs8", "pkcs1", "sec1"];
    for (const type of derTypes) {
      try {
        return crypto.createPrivateKey({
          key: derBuffer,
          format: "der",
          type
        });
      } catch {
        // try next type
      }
    }

    throw pemError;
  }
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
  const privateKey = createPrivateKeyObject(privateKeyPem);

  const jwt = new SignJWT({
    iss: clientId,
    sub: clientId,
    aud: TOKEN_AUDIENCE,
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

async function requestCozeToken(assertion, clientId) {
  const requestVariants = [
    {
      name: "authorization_header_json",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${assertion}`
      },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        duration_seconds: 3600
      })
    },
    {
      name: "assertion_json",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
        client_id: clientId,
        duration_seconds: 3600
      })
    },
    {
      name: "client_assertion_form",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_assertion_type:
          "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion: assertion
      }).toString()
    }
  ];

  let lastFailure = null;

  for (const variant of requestVariants) {
    const upstreamResponse = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: variant.headers,
      body: variant.body
    });

    const upstreamText = await upstreamResponse.text();
    const upstreamPayload = parseUpstreamPayload(upstreamText);

    if (upstreamResponse.ok) {
      return {
        ok: true,
        variant: variant.name,
        payload: upstreamPayload
      };
    }

    lastFailure = {
      ok: false,
      variant: variant.name,
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      payload: upstreamPayload
    };

    const errorMessage = JSON.stringify(upstreamPayload).toLowerCase();
    const shouldTryNext =
      upstreamResponse.status === 400 ||
      upstreamResponse.status === 401 ||
      errorMessage.includes("empty_jwt") ||
      errorMessage.includes("invalid_client") ||
      errorMessage.includes("invalid_request");

    if (!shouldTryNext) {
      break;
    }
  }

  return lastFailure;
}

function getFriendlyError(error) {
  const rawMessage = error?.message || "Unknown error";

  if (
    rawMessage.includes("DECODER routines") ||
    rawMessage.includes("unsupported") ||
    rawMessage.includes("PEM") ||
    rawMessage.includes("asn1")
  ) {
    return {
      code: "INVALID_PRIVATE_KEY",
      message:
        "COZE_PRIVATE_KEY 格式不正确。请填写完整私钥，建议包含 BEGIN/END PRIVATE KEY；如果你粘贴的是单行内容，请保留 \\n 或直接粘贴多行 PEM。",
      details: {
        name: error?.name || "Error",
        message: rawMessage
      }
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "服务端生成 Coze token 时发生异常。",
    details: {
      name: error?.name || "Error",
      message: rawMessage
    }
  };
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

    const upstreamResult = await requestCozeToken(assertion, clientId);
    if (!upstreamResult?.ok) {
      return jsonResponse(502, {
        error: {
          code: "COZE_TOKEN_REQUEST_FAILED",
          message: "Coze token 接口返回异常。",
          details: {
            status: upstreamResult?.status || 502,
            status_text: upstreamResult?.statusText || "Bad Gateway",
            request_variant: upstreamResult?.variant || "unknown",
            upstream: upstreamResult?.payload || {}
          }
        }
      });
    }

    const upstreamPayload = upstreamResult.payload;
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
      error: getFriendlyError(error)
    });
  }
}
