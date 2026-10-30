import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const originalNativeFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    if (urlStr.includes("api.emailjs.com")) {
      return {
        ok: true,
        status: 200,
        text: async () => "OK",
        json: async () => ({ status: 200 })
      };
    }
    if (urlStr.includes("identitytoolkit.googleapis.com")) {
      return {
        ok: true,
        status: 200,
        text: async () => "OK",
        json: async () => ({
          idToken: "mock-valid-id-token",
          localId: "mock-admin-uid-12345"
        })
      };
    }
    return originalNativeFetch ? originalNativeFetch(url, options) : { ok: true, json: async () => ({}) };
  };
});

afterEach(() => {
  globalThis.fetch = originalNativeFetch;
});

import {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
  EMAILJS_SERVICE_ID,
  EMAILJS_TEMPLATE_ID,
  EMAILJS_PUBLIC_KEY,
  generateAlphanumericOTP,
  getActiveAdminPassword,
  setActiveAdminPassword,
  sendPasswordResetOTP,
  verifyPasswordResetOTP,
  setNewAdminPassword,
  verifyAndResetPassword,
  validatePasswordCriteria,
  ALLOWED_SPECIAL_CHARS,
  computeOTPHash,
  getTestLastGeneratedOTP
} from "../src/features/auth/authService.js";

test("Credentials & Constants: Matches specified admin defaults", () => {
  assert.equal(DEFAULT_ADMIN_EMAIL, "erequesticctadmin@gmail.com");
  assert.equal(DEFAULT_ADMIN_PASSWORD, "#Icct4228");
  assert.equal(EMAILJS_SERVICE_ID, "service_4rwr6df");
  assert.equal(EMAILJS_TEMPLATE_ID, "template_065t767");
  assert.equal(EMAILJS_PUBLIC_KEY, "iC0ESDFLUm8ZrV8q2");
  assert.equal(ALLOWED_SPECIAL_CHARS, "!&#*_");
});

test("OTP Generation: Generates 6-character alphanumeric mixed codes", () => {
  for (let i = 0; i < 20; i++) {
    const code = generateAlphanumericOTP(6);
    assert.equal(code.length, 6);
    assert.match(code, /^[A-Z0-9]{6}$/);
  }

  // Ensure randomness across multiple runs
  const codes = new Set();
  for (let i = 0; i < 50; i++) {
    codes.add(generateAlphanumericOTP(6));
  }
  assert.ok(codes.size >= 45, "Expected high entropy across 50 generated OTPs");
});

test("Password Reset Request: Rejects non-admin email addresses", async () => {
  await assert.rejects(
    async () => {
      await sendPasswordResetOTP("unauthorized@gmail.com");
    },
    /only authorized for the administrative email/i
  );

  await assert.rejects(
    async () => {
      await sendPasswordResetOTP("");
    },
    /Admin email address is required/i
  );
});

test("Password Reset Request: Accepts designated admin email and starts session", async () => {
  // Mock sessionStorage in Node environment
  const mockStorage = {};
  globalThis.sessionStorage = {
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => {
      mockStorage[k] = String(v);
    },
    removeItem: (k) => {
      delete mockStorage[k];
    }
  };

  const result = await sendPasswordResetOTP("erequesticctadmin@gmail.com");
  assert.equal(result.success, true);
  assert.equal(result.email, "erequesticctadmin@gmail.com");

  // Security Rule Verification: OTP is NEVER returned in response to prevent UI exposure
  assert.equal(result.otp, undefined);
  assert.equal(result.demoOtp, undefined);

  // Security Rule Verification: Plaintext OTP is NEVER stored in sessionStorage to prevent DevTools inspection exposure
  const rawSession = mockStorage["erequest_admin_otp_session"];
  assert.ok(rawSession, "Session should be saved in sessionStorage");
  const session = JSON.parse(rawSession);
  assert.equal(session.otp, undefined, "Plaintext OTP must NOT be exposed in sessionStorage");
  assert.ok(session.otpHash, "Salted cryptographic hash must be present");
  assert.match(session.otpHash, /^[a-f0-9]{64}$/);
  assert.equal(session.email, "erequesticctadmin@gmail.com");
  assert.ok(session.expiresAt > Date.now());
});

test("EmailJS Template Variables: Passes {{passcode}} and {{time}} exactly as specified", async () => {
  const originalFetch = globalThis.fetch;
  let interceptedPayload = null;

  globalThis.fetch = async (url, options) => {
    if (url.includes("api.emailjs.com")) {
      interceptedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => "OK"
      };
    }
    return originalFetch(url, options);
  };

  try {
    const mockStorage = {};
    globalThis.sessionStorage = {
      getItem: (k) => mockStorage[k] || null,
      setItem: (k, v) => {
        mockStorage[k] = String(v);
      },
      removeItem: (k) => {
        delete mockStorage[k];
      }
    };

    const res = await sendPasswordResetOTP("erequesticctadmin@gmail.com");
    assert.equal(res.success, true);
    assert.ok(interceptedPayload, "Expected EmailJS fetch call to be intercepted");

    // 1. Service and Template ID checks
    assert.equal(interceptedPayload.service_id, "service_4rwr6df");
    assert.equal(interceptedPayload.template_id, "template_065t767");

    // 2. Template variable keys verification
    const params = interceptedPayload.template_params;
    assert.ok(params, "template_params must be defined");

    // {{passcode}} key for the 6-digit mixed OTP
    assert.ok(params.passcode, "{{passcode}} variable must be defined");
    assert.match(params.passcode, /^[A-Z0-9]{6}$/);

    // {{time}} key for the expiration timestamp
    assert.ok(params.time, "{{time}} variable must be defined");
    assert.match(params.time, /\d{1,2}:\d{2}\s?(?:AM|PM)/i);

    // Session storage OTP hash matches the sent passcode
    const session = JSON.parse(mockStorage["erequest_admin_otp_session"]);
    assert.equal(session.otp, undefined, "Plaintext OTP must not be in session");
    assert.equal(
      session.otpHash,
      computeOTPHash(session.salt, "erequesticctadmin@gmail.com", params.passcode)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Password Reset Verification: Rejects invalid or mismatched entries", async () => {
  const mockStorage = {};
  globalThis.sessionStorage = {
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => {
      mockStorage[k] = String(v);
    },
    removeItem: (k) => {
      delete mockStorage[k];
    }
  };

  await sendPasswordResetOTP("erequesticctadmin@gmail.com");
  const validOtp = getTestLastGeneratedOTP();

  // 1. Wrong OTP code
  await assert.rejects(
    async () => {
      await verifyAndResetPassword(
        "erequesticctadmin@gmail.com",
        "WRONG1",
        "NewSecretPassword123!",
        "NewSecretPassword123!"
      );
    },
    /Invalid verification code/i
  );

  // 2. Mismatched passwords
  await assert.rejects(
    async () => {
      await verifyAndResetPassword(
        "erequesticctadmin@gmail.com",
        validOtp,
        "NewSecretPassword123!",
        "DifferentPassword456!"
      );
    },
    /do not match/i
  );

    // 3. Short password (minimum 8 characters)
  await assert.rejects(
    async () => {
      await verifyAndResetPassword(
        "erequesticctadmin@gmail.com",
        validOtp,
        "Ab1!#",
        "Ab1!#"
      );
    },
    /at least 8 characters long/i
  );

  // 4. Password containing spaces cannot proceed and is rejected
  await assert.rejects(
    async () => {
      await verifyAndResetPassword(
        "erequesticctadmin@gmail.com",
        validOtp,
        "#I CCt4228",
        "#I CCt4228"
      );
    },
    /spaces/i
  );

  // 5. Missing uppercase letter
  await assert.rejects(
    async () => {
      await verifyAndResetPassword(
        "erequesticctadmin@gmail.com",
        validOtp,
        "newadminpass1!",
        "newadminpass1!"
      );
    },
    /uppercase/i
  );

  // 6. Missing lowercase letter
  await assert.rejects(
    async () => {
      await verifyAndResetPassword(
        "erequesticctadmin@gmail.com",
        validOtp,
        "NEWADMINPASS1!",
        "NEWADMINPASS1!"
      );
    },
    /lowercase/i
  );

  // 7. Missing number
  await assert.rejects(
    async () => {
      await verifyAndResetPassword(
        "erequesticctadmin@gmail.com",
        validOtp,
        "NewAdminPass!",
        "NewAdminPass!"
      );
    },
    /number/i
  );

  // 8. Missing special character
  await assert.rejects(
    async () => {
      await verifyAndResetPassword(
        "erequesticctadmin@gmail.com",
        validOtp,
        "NewAdminPass123",
        "NewAdminPass123"
      );
    },
    /special character/i
  );

  // 9. Unallowed special characters (e.g. @ or $; only !&#*_ permitted)
  await assert.rejects(
    async () => {
      await verifyAndResetPassword(
        "erequesticctadmin@gmail.com",
        validOtp,
        "NewAdminPass123@",
        "NewAdminPass123@"
      );
    },
    /Only !, &, #, \*, and _/i
  );
});

test("Password Reset Execution: Updates active password and invalidates OTP", async () => {
  const mockSession = {};
  const mockLocal = {};
  globalThis.sessionStorage = {
    getItem: (k) => mockSession[k] || null,
    setItem: (k, v) => {
      mockSession[k] = String(v);
    },
    removeItem: (k) => {
      delete mockSession[k];
    }
  };
  globalThis.localStorage = {
    getItem: (k) => mockLocal[k] || null,
    setItem: (k, v) => {
      mockLocal[k] = String(v);
    },
    removeItem: (k) => {
      delete mockLocal[k];
    }
  };

  // Initial password
  assert.equal(getActiveAdminPassword(), "#Icct4228");

  // Send OTP
  await sendPasswordResetOTP("erequesticctadmin@gmail.com");
  const validOtp = getTestLastGeneratedOTP();

  // Verify and reset with matching passwords
  const result = await verifyAndResetPassword(
    "erequesticctadmin@gmail.com",
    validOtp,
    "#NewAdminPass2026",
    "#NewAdminPass2026"
  );

  assert.equal(result.success, true);
  assert.equal(getActiveAdminPassword(), "#NewAdminPass2026");

  // Ensure OTP cannot be reused
  await assert.rejects(
    async () => {
      await verifyAndResetPassword(
        "erequesticctadmin@gmail.com",
        validOtp,
        "#AnotherPass999",
        "#AnotherPass999"
      );
    },
    /No active OTP session found/i
  );

  // Clean up
  setActiveAdminPassword("#Icct4228");
  assert.equal(getActiveAdminPassword(), "#Icct4228");
});

test("Two-Page Separation: Step 1 (OTP verification) and Step 2 (Set password) operate sequentially", async () => {
  const mockSession = {};
  const mockLocal = {};
  globalThis.sessionStorage = {
    getItem: (k) => mockSession[k] || null,
    setItem: (k, v) => {
      mockSession[k] = String(v);
    },
    removeItem: (k) => {
      delete mockSession[k];
    }
  };
  globalThis.localStorage = {
    getItem: (k) => mockLocal[k] || null,
    setItem: (k, v) => {
      mockLocal[k] = String(v);
    },
    removeItem: (k) => {
      delete mockLocal[k];
    }
  };

  // Step 0: Request OTP
  await sendPasswordResetOTP("erequesticctadmin@gmail.com");
  const otpCode = getTestLastGeneratedOTP();
  assert.ok(otpCode);

  // Security check: Calling Step 2 (setNewAdminPassword) before Step 1 (verifyPasswordResetOTP) must fail
  await assert.rejects(
    async () => {
      await setNewAdminPassword(
        "erequesticctadmin@gmail.com",
        "NewSecretPassword99!",
        "NewSecretPassword99!"
      );
    },
    /Security validation failed|Please verify your OTP code/i
  );

  // Step 1: Verify OTP on dedicated OTP screen
  const verifyResult = await verifyPasswordResetOTP(
    "erequesticctadmin@gmail.com",
    otpCode
  );
  assert.equal(verifyResult.success, true);
  assert.equal(verifyResult.verified, true);

  // Step 2: Set New Password on dedicated Password screen
  const updateResult = await setNewAdminPassword(
    "erequesticctadmin@gmail.com",
    "#NewAdminPassPhase2",
    "#NewAdminPassPhase2"
  );
  assert.equal(updateResult.success, true);
  assert.equal(getActiveAdminPassword(), "#NewAdminPassPhase2");

  // Reset to default
  setActiveAdminPassword("#Icct4228");
});

test("Route Mode Resolution: Direct navigation correctly maps to forgot_password mode", () => {
  const resolveMode = ({ pathname, search = "", state = null, initialMode = "login" }) => {
    if (pathname === "/forgot-password") {
      return "forgot_password";
    }
    const params = new URLSearchParams(search);
    const paramMode = params.get("mode");
    if (paramMode === "forgot_password" || paramMode === "forgot-password") {
      return "forgot_password";
    }
    if (state?.mode) {
      return state.mode;
    }
    return initialMode || "login";
  };

  // Direct route to /forgot-password lands directly in forgot_password mode ("agad")
  assert.equal(resolveMode({ pathname: "/forgot-password" }), "forgot_password");

  // Query parameter ?mode=forgot_password lands directly in forgot_password mode
  assert.equal(resolveMode({ pathname: "/login", search: "?mode=forgot_password" }), "forgot_password");

  // Location state mode: "forgot_password"
  assert.equal(resolveMode({ pathname: "/login", state: { mode: "forgot_password" } }), "forgot_password");

  // Default /login lands in login mode
  assert.equal(resolveMode({ pathname: "/login" }), "login");
});

test("Password Criteria Live Evaluator: Correctly evaluates green/red states and ignores spaces", () => {
  // 1. Empty input -> all criteria unfulfilled (red)
  const emptyEval = validatePasswordCriteria("");
  assert.equal(emptyEval.isMinLength, false);
  assert.equal(emptyEval.hasUppercase, false);
  assert.equal(emptyEval.hasLowercase, false);
  assert.equal(emptyEval.hasNumber, false);
  assert.equal(emptyEval.hasSpecial, false);
  assert.equal(emptyEval.hasSpecialOnly, false);
  assert.equal(emptyEval.isValid, false);

  // 2. Space detection: Spaces MUST NOT count towards length
  // "Abcd!#1 " has 7 non-spaces + 1 space. Length must be 7, not 8!
  const spaceCountEval = validatePasswordCriteria("Abcd!#1 ");
  assert.equal(spaceCountEval.nonSpaceLength, 7);
  assert.equal(spaceCountEval.isMinLength, false, "Spaces should not be counted towards minimum 8 characters");
  assert.equal(spaceCountEval.isValid, false);

  // Multiple spaces "        " (8 spaces) -> non-space length 0
  const allSpacesEval = validatePasswordCriteria("        ");
  assert.equal(allSpacesEval.nonSpaceLength, 0);
  assert.equal(allSpacesEval.isMinLength, false);
  assert.equal(allSpacesEval.isValid, false);

  // Password with space cannot proceed (isValid is false) even if other criteria are met: "#I CCt4228"
  const passwordWithSpace = validatePasswordCriteria("#I CCt4228");
  assert.equal(passwordWithSpace.nonSpaceLength, 9);
  assert.equal(passwordWithSpace.isMinLength, true, "Spaces are not counted, so 9 non-spaces >= 8");
  assert.equal(passwordWithSpace.hasUppercase, true);
  assert.equal(passwordWithSpace.hasLowercase, true);
  assert.equal(passwordWithSpace.hasNumber, true);
  assert.equal(passwordWithSpace.hasSpecialOnly, true);
  assert.equal(passwordWithSpace.hasNoSpaces, false);
  assert.equal(passwordWithSpace.isValid, false, "Cannot proceed if space is detected");

  // Removing the space allows the password to proceed: "#ICCt4228"
  const cleanPassword = validatePasswordCriteria("#ICCt4228");
  assert.equal(cleanPassword.hasNoSpaces, true);
  assert.equal(cleanPassword.isValid, true);

  // 3. Special characters: Only !&#*_ are permitted
  // Test valid special characters one by one
  for (const char of ["!", "&", "#", "*", "_"]) {
    const validRes = validatePasswordCriteria(`AdminPass1${char}`);
    assert.equal(validRes.hasSpecial, true, `Expected ${char} to satisfy hasSpecial`);
    assert.equal(validRes.hasSpecialOnly, true, `Expected ${char} to satisfy hasSpecialOnly`);
    assert.equal(validRes.isValid, true, `Expected AdminPass1${char} to be completely valid`);
  }

  // Test invalid special characters like @, $, %, ^
  for (const badChar of ["@", "$", "%", "^", "(", ")", "+", "=", "-", "?"]) {
    const invalidRes = validatePasswordCriteria(`AdminPass1${badChar}`);
    assert.equal(invalidRes.hasSpecial, false, `Expected ${badChar} to NOT satisfy allowed special characters`);
    assert.equal(invalidRes.hasSpecialOnly, false, `Expected ${badChar} to fail hasSpecialOnly`);
    assert.equal(invalidRes.isValid, false);
  }

  // Mixed allowed and disallowed special characters: "AdminPass1!@"
  const mixedSpecial = validatePasswordCriteria("AdminPass1!@");
  assert.equal(mixedSpecial.hasSpecial, true, "Has ! so hasSpecial is true");
  assert.equal(mixedSpecial.hasSpecialOnly, false, "Has @ so hasSpecialOnly must be false (red)");
  assert.equal(mixedSpecial.isValid, false);

  // 4. Fully compliant password satisfies all criteria
  const fullyValid = validatePasswordCriteria("SecurePass2026#");
  assert.equal(fullyValid.isMinLength, true);
  assert.equal(fullyValid.hasUppercase, true);
  assert.equal(fullyValid.hasLowercase, true);
  assert.equal(fullyValid.hasNumber, true);
  assert.equal(fullyValid.hasSpecial, true);
  assert.equal(fullyValid.hasSpecialOnly, true);
  assert.equal(fullyValid.isValid, true);
});

test("Security Defense: DevTools Console tampering (verified: true bypass) is blocked", async () => {
  const mockStorage = {};
  globalThis.sessionStorage = {
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; }
  };

  // Attacker injects forged session directly into sessionStorage via Console
  mockStorage["erequest_admin_otp_session"] = JSON.stringify({
    email: "erequesticctadmin@gmail.com",
    otp: "123456",
    expiresAt: Date.now() + 600000,
    verified: true
  });

  // 1. Forged verified boolean without valid token is blocked
  await assert.rejects(
    async () => {
      await setNewAdminPassword(
        "erequesticctadmin@gmail.com",
        "#NewHackerPass123",
        "#NewHackerPass123"
      );
    },
    /Please verify your OTP code before setting a new password/i
  );

  // 2. Forged verification token is blocked with security validation failure
  mockStorage["erequest_admin_otp_session"] = JSON.stringify({
    email: "erequesticctadmin@gmail.com",
    salt: "random_salt",
    otpHash: "forged_hash",
    verifiedToken: "forged_token_123",
    expiresAt: Date.now() + 600000,
    verified: true
  });

  await assert.rejects(
    async () => {
      await setNewAdminPassword(
        "erequesticctadmin@gmail.com",
        "#NewHackerPass123",
        "#NewHackerPass123"
      );
    },
    /Security validation failed/i
  );
});

test("Security Defense: Exceeding max OTP attempts (5/5) revokes the session", async () => {
  const mockStorage = {};
  globalThis.sessionStorage = {
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; }
  };

  await sendPasswordResetOTP("erequesticctadmin@gmail.com");

  // 4 failed attempts show remaining countdown
  for (let i = 0; i < 4; i++) {
    await assert.rejects(
      async () => {
        await verifyPasswordResetOTP("erequesticctadmin@gmail.com", "BAD000");
      },
      /Invalid verification code.*attempt.*remaining/i
    );
  }

  // 5th failed attempt revokes the session completely
  await assert.rejects(
    async () => {
      await verifyPasswordResetOTP("erequesticctadmin@gmail.com", "BAD000");
    },
    /Too many failed attempts/i
  );

  assert.equal(mockStorage["erequest_admin_otp_session"], undefined);
});

