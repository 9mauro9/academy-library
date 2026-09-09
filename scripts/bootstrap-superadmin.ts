#!/usr/bin/env tsx
/**
 * scripts/bootstrap-superadmin.ts — OS 2.2 Idempotent Super-Admin Provisioning CLI
 *
 * Provisions or elevates the designer super_admin identity in Firebase Auth and Firestore.
 * Sets custom user claims: { role: 'super_admin' }
 * Ensures `/users/{uid}` document reflects `role: 'super_admin'`
 * Writes initial entry to `/audit_logs`
 *
 * Usage:
 *   npx tsx scripts/bootstrap-superadmin.ts [targetEmail]
 *   DESIGNER_SUPERADMIN_EMAIL=admin@arista.com npx tsx scripts/bootstrap-superadmin.ts
 */

import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_SUPERADMIN_EMAIL = '9mauro9@gmail.com';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'academy-live-builder';

// Resolve Target Email & UID
const targetEmail = (
  process.argv[2] && !process.argv[2].startsWith('--')
    ? process.argv[2]
    : process.env.DESIGNER_SUPERADMIN_EMAIL || DEFAULT_SUPERADMIN_EMAIL
).trim().toLowerCase();

const targetUid = process.env.DESIGNER_SUPERADMIN_UID;
const isDryRun = process.argv.includes('--dry-run');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  Academy Apps OS 2.2 — Super-Admin Provisioning Bootstrap CLI');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`• Target Email   : ${targetEmail}`);
console.log(`• Project ID     : ${PROJECT_ID}`);
console.log(`• Dry Run Mode   : ${isDryRun ? 'YES (No modifications)' : 'NO (Live Execution)'}`);

let app: App;

if (!getApps().length) {
  const serviceKeyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || 
    path.resolve(process.cwd(), 'academy-library-key.json');

  if (fs.existsSync(serviceKeyPath)) {
    console.log(`• Service Account: Loaded from ${serviceKeyPath}`);
    app = initializeApp({
      credential: cert(serviceKeyPath),
      projectId: PROJECT_ID,
    });
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY && process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim().startsWith('{')) {
    console.log('• Service Account: Loaded from inline JSON environment variable');
    app = initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
      projectId: PROJECT_ID,
    });
  } else if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.log('• Emulator Mode  : Connecting to local Auth/Firestore emulators');
    app = initializeApp({ projectId: PROJECT_ID });
  } else {
    console.log('• Credentials    : Using Application Default Credentials (ADC)');
    app = initializeApp({ projectId: PROJECT_ID });
  }
} else {
  app = getApps()[0];
}

const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  try {
    let userRecord: any = null;

    // 1. Locate User in Firebase Auth
    try {
      if (targetUid) {
        userRecord = await auth.getUser(targetUid);
      } else {
        userRecord = await auth.getUserByEmail(targetEmail);
      }
      console.log(`✔ Found existing Auth record: UID = ${userRecord.uid} (${userRecord.email})`);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        console.log(`ℹ User not found in Firebase Auth. Provisioning placeholder identity for ${targetEmail}...`);
        if (!isDryRun) {
          userRecord = await auth.createUser({
            email: targetEmail,
            emailVerified: true,
            displayName: 'Academy Designer SuperAdmin',
          });
          console.log(`✔ Created Auth user record: UID = ${userRecord.uid}`);
        } else {
          console.log(`[DRY-RUN] Would create user record for ${targetEmail}`);
          return;
        }
      } else {
        throw error;
      }
    }

    if (!userRecord) {
      throw new Error('Failed to resolve or create user record.');
    }

    const uid = userRecord.uid;
    const currentClaims = userRecord.customClaims || {};
    console.log(`• Current Custom Claims:`, JSON.stringify(currentClaims));

    // 2. Set Super-Admin Custom Claims
    const updatedClaims = {
      ...currentClaims,
      role: 'super_admin',
    };

    if (!isDryRun) {
      await auth.setCustomUserClaims(uid, updatedClaims);
      console.log(`✔ Injected custom claims: { role: 'super_admin' }`);

      // Invalidate existing refresh tokens so new claims take immediate effect
      await auth.revokeRefreshTokens(uid);
      console.log(`✔ Revoked active refresh tokens to force immediate claims token minting.`);
    } else {
      console.log(`[DRY-RUN] Would inject custom claims: { role: 'super_admin' }`);
    }

    // 3. Update or Create /users/{uid} in Firestore
    const userDocRef = db.collection('users').doc(uid);
    const userSnap = await userDocRef.get();

    const now = FieldValue.serverTimestamp();

    if (!isDryRun) {
      if (!userSnap.exists) {
        await userDocRef.set({
          uid,
          email: targetEmail,
          displayName: userRecord.displayName || 'Academy Designer SuperAdmin',
          provider: 'google.com',
          role: 'super_admin',
          createdAt: now,
          lastLoginAt: now,
          lastActiveApp: 'builder',
          updatedAt: now,
        });
        console.log(`✔ Created new Firestore user profile at /users/${uid} with role: 'super_admin'`);
      } else {
        await userDocRef.set(
          {
            email: targetEmail,
            role: 'super_admin',
            updatedAt: now,
          },
          { merge: true }
        );
        console.log(`✔ Updated existing Firestore user profile at /users/${uid} with role: 'super_admin'`);
      }

      // 4. Record Immutable Audit Event
      const auditLogRef = db.collection('audit_logs').doc();
      await auditLogRef.set({
        timestamp: now,
        userId: uid,
        userEmail: targetEmail,
        appId: 'builder',
        eventType: 'CAPABILITY_INVOCATION',
        metadata: {
          action: 'BOOTSTRAP_SUPERADMIN',
          grantedRole: 'super_admin',
          executor: 'scripts/bootstrap-superadmin.ts',
          clientIp: '127.0.0.1 (CLI)',
          platform: process.platform,
        },
      });
      console.log(`✔ Appended immutable audit log: /audit_logs/${auditLogRef.id}`);
    } else {
      console.log(`[DRY-RUN] Would update /users/${uid} and write to /audit_logs`);
    }

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`🎉 Bootstrap SUCCESSFUL: ${targetEmail} is verified as super_admin.`);
    console.log('═══════════════════════════════════════════════════════════════════\n');
  } catch (err: any) {
    console.error('❌ Bootstrap FAILED with error:', err.message || err);
    process.exit(1);
  }
}

main().then(() => process.exit(0));
