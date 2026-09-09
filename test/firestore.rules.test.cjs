/**
 * firestore.rules.test.cjs — OS 2.2 Security Rules Test Suite
 * Uses @firebase/rules-unit-testing against local Firebase Emulator.
 * Run with: firebase emulators:exec --only firestore 'npm run test:rules'
 * See .agents/rules/security_least_priv.md for full policy.
 */

'use strict';

const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'demo-academy-library';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

afterEach(async () => {
  if (testEnv) await testEnv.clearFirestore();
});

// ─── PUBLIC CATALOG COLLECTIONS ─────────────────────────────────────────────

describe('Public catalog — assets', () => {
  test('unauthenticated user CAN read assets', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(db.collection('assets').get());
  });

  test('unauthenticated user CANNOT write assets', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      db.collection('assets').doc('test-asset').set({ title: 'Test' })
    );
  });

  test('authenticated non-admin CANNOT write assets', async () => {
    const db = testEnv.authenticatedContext('user-123').firestore();
    await assertFails(
      db.collection('assets').doc('test-asset').set({ title: 'Test' })
    );
  });

  test('admin user CAN write assets', async () => {
    const db = testEnv
      .authenticatedContext('admin-user', { admin: true })
      .firestore();
    await assertSucceeds(
      db.collection('assets').doc('test-asset').set({ title: 'Admin Asset' })
    );
  });
});

// ─── MULTI-TENANT USER ISOLATION ────────────────────────────────────────────

describe('User isolation — /users/{userId}', () => {
  test('user CAN read their own document', async () => {
    const db = testEnv.authenticatedContext('user-abc').firestore();
    await assertSucceeds(db.collection('users').doc('user-abc').get());
  });

  test('user CANNOT read another user document', async () => {
    const db = testEnv.authenticatedContext('user-abc').firestore();
    await assertFails(db.collection('users').doc('user-xyz').get());
  });

  test('user CAN write their own document', async () => {
    const db = testEnv.authenticatedContext('user-abc').firestore();
    await assertSucceeds(
      db.collection('users').doc('user-abc').set({ displayName: 'Mauro' })
    );
  });

  test('user CANNOT write to another user document', async () => {
    const db = testEnv.authenticatedContext('user-abc').firestore();
    await assertFails(
      db.collection('users').doc('user-xyz').set({ displayName: 'Hacked' })
    );
  });
});

// ─── USER-OWNED TOP-LEVEL COLLECTIONS ───────────────────────────────────────

describe('User-owned collections — user_notes', () => {
  test('authenticated user CAN read their own note', async () => {
    // Seed the document first as admin
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection('user_notes')
        .doc('note-1')
        .set({ userId: 'user-abc', content: 'Test note' });
    });

    const db = testEnv.authenticatedContext('user-abc').firestore();
    await assertSucceeds(db.collection('user_notes').doc('note-1').get());
  });

  test('authenticated user CANNOT read another user note', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection('user_notes')
        .doc('note-2')
        .set({ userId: 'user-xyz', content: 'Private note' });
    });

    const db = testEnv.authenticatedContext('user-abc').firestore();
    await assertFails(db.collection('user_notes').doc('note-2').get());
  });
});

// ─── CENTRALIZED USER REGISTRY & AUDIT LEDGER (OS 2.2) ──────────────────────

describe('Centralized User Registry — /users/{userId}', () => {
  test('super_admin CAN read any user profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc('user-target').set({
        uid: 'user-target',
        email: 'target@arista.com',
        role: 'user',
      });
    });

    const db = testEnv.authenticatedContext('admin-uid', { role: 'super_admin' }).firestore();
    await assertSucceeds(db.collection('users').doc('user-target').get());
  });

  test('user CAN read their own profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc('user-self').set({
        uid: 'user-self',
        email: 'self@arista.com',
        role: 'user',
      });
    });

    const db = testEnv.authenticatedContext('user-self').firestore();
    await assertSucceeds(db.collection('users').doc('user-self').get());
  });

  test('user CANNOT read another user profile', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc('user-other').set({
        uid: 'user-other',
        email: 'other@arista.com',
        role: 'user',
      });
    });

    const db = testEnv.authenticatedContext('user-self').firestore();
    await assertFails(db.collection('users').doc('user-other').get());
  });

  test('user CANNOT elevate their own role', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc('user-self').set({
        uid: 'user-self',
        email: 'self@arista.com',
        role: 'user',
      });
    });

    const db = testEnv.authenticatedContext('user-self').firestore();
    await assertFails(
      db.collection('users').doc('user-self').update({ role: 'super_admin' })
    );
  });
});

describe('Centralized Audit Log Ledger — /audit_logs/{logId}', () => {
  test('super_admin CAN read audit logs', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('audit_logs').doc('log-1').set({
        userId: 'user-1',
        eventType: 'AUTH_SIGN_IN',
      });
    });

    const db = testEnv.authenticatedContext('admin-uid', { role: 'super_admin' }).firestore();
    await assertSucceeds(db.collection('audit_logs').doc('log-1').get());
  });

  test('regular user CANNOT read audit logs', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('audit_logs').doc('log-1').set({
        userId: 'user-1',
        eventType: 'AUTH_SIGN_IN',
      });
    });

    const db = testEnv.authenticatedContext('user-1').firestore();
    await assertFails(db.collection('audit_logs').doc('log-1').get());
  });

  test('authenticated user CAN append to audit logs', async () => {
    const db = testEnv.authenticatedContext('user-1').firestore();
    await assertSucceeds(
      db.collection('audit_logs').add({
        userId: 'user-1',
        appId: 'library',
        eventType: 'ROUTE_NAVIGATION',
      })
    );
  });

  test('audit log entries are strictly IMMUTABLE (cannot update or delete)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('audit_logs').doc('log-immutable').set({
        userId: 'user-1',
        eventType: 'AUTH_SIGN_IN',
      });
    });

    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'super_admin' }).firestore();
    const userDb = testEnv.authenticatedContext('user-1').firestore();

    await assertFails(adminDb.collection('audit_logs').doc('log-immutable').update({ eventType: 'TAMPERED' }));
    await assertFails(adminDb.collection('audit_logs').doc('log-immutable').delete());
    await assertFails(userDb.collection('audit_logs').doc('log-immutable').update({ eventType: 'TAMPERED' }));
    await assertFails(userDb.collection('audit_logs').doc('log-immutable').delete());
  });
});

// ─── DEFAULT DENY ────────────────────────────────────────────────────────────

describe('Default deny — unmatched collections', () => {
  test('unauthenticated user CANNOT access unmatched collection', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('some_unknown_collection').get());
  });

  test('authenticated user CANNOT access unmatched collection', async () => {
    const db = testEnv.authenticatedContext('user-abc').firestore();
    await assertFails(db.collection('some_unknown_collection').get());
  });
});
