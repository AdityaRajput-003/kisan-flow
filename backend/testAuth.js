process.env.USE_MOCK_DB = 'true';
const http = require('http');
const app = require('./src/app');

function runAuthVerification() {
  const server = http.createServer(app);
  server.listen(0, async () => {
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;
    console.log(`[Verification Test] Server listening on ${baseUrl}`);

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
      if (condition) {
        console.log(`[PASS] ${message}`);
        passed++;
      } else {
        console.error(`[FAIL] ${message}`);
        failed++;
      }
    }

    let farmerToken = '';
    let officerToken = '';

    try {
      // 1. Register Farmer (without passing role)
      console.log('\n--- Test 1: Register Farmer ---');
      const regRes = await postJson(`${baseUrl}/api/auth/register`, {
        name: 'Test Farmer',
        phone: '9999999999',
        password: 'password123',
      });
      assert(regRes.status === 201 && regRes.body.success, 'Test 1: Public registration creates user (HTTP 201)');
      assert(regRes.body.data?.user?.role === 'FARMER', 'Test 1: Public registration assigns FARMER role');
      farmerToken = regRes.body.data?.token || '';

      // 1b. Role Escalation Prevention Test (Pass role ADMIN explicitly)
      console.log('\n--- Test 1b: Role Escalation Prevention Test (Attempting ADMIN) ---');
      const escAdminRes = await postJson(`${baseUrl}/api/auth/register`, {
        name: 'Malicious User Admin',
        phone: '7777777777',
        role: 'ADMIN',
        password: 'password123',
      });
      assert(escAdminRes.status === 201, 'Test 1b: Registration succeeds');
      assert(escAdminRes.body.data?.user?.role === 'FARMER', 'Test 1b: Role escalation to ADMIN prevented (role remains FARMER)');

      // 1c. Role Escalation Prevention Test (Pass role OFFICER explicitly)
      console.log('\n--- Test 1c: Role Escalation Prevention Test (Attempting OFFICER) ---');
      const escOfficerRes = await postJson(`${baseUrl}/api/auth/register`, {
        name: 'Malicious User Officer',
        phone: '6666666666',
        role: 'OFFICER',
        password: 'password123',
      });
      assert(escOfficerRes.status === 201, 'Test 1c: Registration succeeds');
      assert(escOfficerRes.body.data?.user?.role === 'FARMER', 'Test 1c: Role escalation to OFFICER prevented (role remains FARMER)');

      // 2. Login Suite & Password Validation Tests
      console.log('\n--- Test 2a: Login with Valid Credentials ---');
      const loginValidRes = await postJson(`${baseUrl}/api/auth/login`, {
        phone: '9999999999',
        password: 'password123',
      });
      assert(loginValidRes.status === 200 && loginValidRes.body.success, 'Test 2a: Valid credentials succeed (HTTP 200)');
      assert(Boolean(loginValidRes.body.data?.token), 'Test 2a: Valid login issues a JWT token');
      assert(loginValidRes.body.data?.user?.role === 'FARMER', 'Test 2a: User role is FARMER');

      console.log('\n--- Test 2b: Missing Password Rejected ---');
      const loginMissingPass = await postJson(`${baseUrl}/api/auth/login`, {
        phone: '9999999999',
      });
      assert(loginMissingPass.status === 400 && !loginMissingPass.body.success, 'Test 2b: Missing password rejected (HTTP 400)');
      assert(loginMissingPass.body.error === 'Password is required', 'Test 2b: Returns "Password is required" error message');
      assert(!loginMissingPass.body.data?.token, 'Test 2b: No JWT issued on missing password');

      console.log('\n--- Test 2c: Empty Password Rejected ---');
      const loginEmptyPass = await postJson(`${baseUrl}/api/auth/login`, {
        phone: '9999999999',
        password: '',
      });
      assert(loginEmptyPass.status === 400 && !loginEmptyPass.body.success, 'Test 2c: Empty password rejected (HTTP 400)');
      assert(!loginEmptyPass.body.data?.token, 'Test 2c: No JWT issued on empty password');

      console.log('\n--- Test 2d: Whitespace Password Rejected ---');
      const loginWhitespacePass = await postJson(`${baseUrl}/api/auth/login`, {
        phone: '9999999999',
        password: '    ',
      });
      assert(loginWhitespacePass.status === 400 && !loginWhitespacePass.body.success, 'Test 2d: Whitespace password rejected (HTTP 400)');
      assert(!loginWhitespacePass.body.data?.token, 'Test 2d: No JWT issued on whitespace password');

      console.log('\n--- Test 2e: Incorrect Password Rejected ---');
      const loginWrongPass = await postJson(`${baseUrl}/api/auth/login`, {
        phone: '9999999999',
        password: 'wrong_password_123',
      });
      assert(loginWrongPass.status === 401 && !loginWrongPass.body.success, 'Test 2e: Incorrect password rejected (HTTP 401)');
      assert(loginWrongPass.body.error === 'Invalid phone number or password', 'Test 2e: Returns "Invalid phone number or password"');
      assert(!loginWrongPass.body.data?.token, 'Test 2e: No JWT issued on incorrect password');

      console.log('\n--- Test 2f: Passwordless Login Attempt on Admin Account Rejected ---');
      const adminPasswordless = await postJson(`${baseUrl}/api/auth/login`, {
        phone: '9876543212', // Admin Anita Roy
      });
      assert(adminPasswordless.status === 400 && !adminPasswordless.body.success, 'Test 2f: Passwordless login on Admin rejected (HTTP 400)');
      assert(!adminPasswordless.body.data?.token, 'Test 2f: No Admin JWT issued on missing password');

      console.log('\n--- Test 2g: Empty Password on Admin Account Rejected ---');
      const adminEmptyPass = await postJson(`${baseUrl}/api/auth/login`, {
        phone: '9876543212',
        password: '',
      });
      assert(adminEmptyPass.status === 400 && !adminEmptyPass.body.success, 'Test 2g: Empty password on Admin rejected (HTTP 400)');
      assert(!adminEmptyPass.body.data?.token, 'Test 2g: No Admin JWT issued on empty password');

      console.log('\n--- Test 2h: Incorrect Password on Admin Account Rejected ---');
      const adminWrongPass = await postJson(`${baseUrl}/api/auth/login`, {
        phone: '9876543212',
        password: 'incorrect_admin_pw',
      });
      assert(adminWrongPass.status === 401 && !adminWrongPass.body.success, 'Test 2h: Incorrect password on Admin rejected (HTTP 401)');
      assert(!adminWrongPass.body.data?.token, 'Test 2h: No Admin JWT issued on wrong password');

      console.log('\n--- Test 2i: Valid Admin Credentials Succeed ---');
      const adminValidLogin = await postJson(`${baseUrl}/api/auth/login`, {
        phone: '9876543212',
        password: 'password123',
      });
      assert(adminValidLogin.status === 200 && adminValidLogin.body.success, 'Test 2i: Valid Admin credentials succeed (HTTP 200)');
      assert(adminValidLogin.body.data?.user?.role === 'ADMIN', 'Test 2i: User role is ADMIN');
      assert(Boolean(adminValidLogin.body.data?.token), 'Test 2i: Valid Admin JWT issued');

      // 3. Register Officer (For test suite setup only - simulated direct DB insert)
      const { memoryDb } = require('./src/config/dbFallback');
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('password123', 10);
      const officerUser = {
        id: memoryDb.nextUserId++,
        name: 'Test Officer',
        phone: '8888888888',
        role: 'OFFICER',
        password_hash: hash,
        created_at: new Date(),
      };
      memoryDb.users.push(officerUser);

      console.log('\n--- Test 3: Login Officer with Valid Credentials ---');
      const loginOffRes = await postJson(`${baseUrl}/api/auth/login`, {
        phone: '8888888888',
        password: 'password123',
      });
      assert(loginOffRes.status === 200 && loginOffRes.body.success, 'Test 3: Valid Officer credentials succeed (HTTP 200)');
      assert(loginOffRes.body.data?.user?.role === 'OFFICER', 'Test 3: User role is OFFICER');
      officerToken = loginOffRes.body.data.token;

      console.log('\n--- Test 3b: Password verification error fails safely ---');
      const originalCompare = bcrypt.compare;
      bcrypt.compare = async () => { throw new Error('Simulated bcrypt comparison error'); };
      try {
        const bcryptErrRes = await postJson(`${baseUrl}/api/auth/login`, {
          phone: '8888888888',
          password: 'password123',
        });
        assert(bcryptErrRes.status === 401 && !bcryptErrRes.body.success, 'Test 3b: Bcrypt comparison error fails safely (HTTP 401)');
        assert(bcryptErrRes.body.error === 'Invalid phone number or password', 'Test 3b: Returns standard invalid credentials message');
        assert(!bcryptErrRes.body.data?.token, 'Test 3b: No JWT issued on bcrypt error');
      } finally {
        bcrypt.compare = originalCompare;
      }

      // 4. Access Protected Route with valid Farmer Token
      console.log('\n--- Test 4: Farmer accessing Farmer route ---');
      const farmerAccess = await getJson(`${baseUrl}/api/test/farmer`, farmerToken);
      assert(farmerAccess.status === 200 && farmerAccess.body.success, 'Test 4: Farmer accesses /api/test/farmer (HTTP 200)');

      // 5. Reject missing JWT
      console.log('\n--- Test 5: Missing JWT ---');
      const noJwtAccess = await getJson(`${baseUrl}/api/test/farmer`, '');
      assert(noJwtAccess.status === 401 && !noJwtAccess.body.success, 'Test 5: Missing JWT rejected (HTTP 401)');

      // 6. Reject invalid JWT
      console.log('\n--- Test 6: Invalid JWT ---');
      const invalidJwtAccess = await getJson(`${baseUrl}/api/test/farmer`, 'invalid.jwt.token');
      assert(invalidJwtAccess.status === 401 && !invalidJwtAccess.body.success, 'Test 6: Invalid JWT rejected (HTTP 401)');

      // 7. Role middleware rejects incorrect role (Farmer attempting Officer route)
      console.log('\n--- Test 7: Farmer accessing Officer route (Forbidden) ---');
      const forbiddenAccess = await getJson(`${baseUrl}/api/test/officer`, farmerToken);
      assert(forbiddenAccess.status === 403 && !forbiddenAccess.body.success, 'Test 7: Farmer accessing Officer route rejected (HTTP 403)');

      // 8. Officer accessing Officer route
      console.log('\n--- Test 8: Officer accessing Officer route ---');
      const officerAccess = await getJson(`${baseUrl}/api/test/officer`, officerToken);
      assert(officerAccess.status === 200 && officerAccess.body.success, 'Test 8: Officer accesses /api/test/officer (HTTP 200)');

      console.log('\n==================================================');
      console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
      console.log('==================================================');

      if (failed > 0) {
        process.exitCode = 1;
      } else {
        process.exitCode = 0;
      }
    } catch (err) {
      console.error('[Verification Test Error]', err);
      process.exitCode = 1;
    } finally {
      server.close();
    }
  });
}

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => (resData += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(resData) });
          } catch (e) {
            resolve({ status: res.statusCode, body: resData });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getJson(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'GET',
        headers,
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => (resData += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(resData) });
          } catch (e) {
            resolve({ status: res.statusCode, body: resData });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

if (require.main === module) {
  runAuthVerification();
}
