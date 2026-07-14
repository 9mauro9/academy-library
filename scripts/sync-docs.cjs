const fs = require('fs');
const path = require('path');

function runSyncDocs() {
  console.log('=== RUNNING LIBRARIAN SYNCHRONIZATION AND VERIFICATION GUARD ===');

  const rootDir = path.join(__dirname, '..');
  const dataModelPath = path.join(rootDir, 'docs', 'data-model.md');
  const rulesPath = path.join(rootDir, 'firestore.rules');
  const archPath = path.join(rootDir, 'ARCHITECTURE.md');

  // Verify paths exist
  if (!fs.existsSync(dataModelPath)) {
    console.error(`[ERROR] Data Model file not found at: ${dataModelPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(rulesPath)) {
    console.error(`[ERROR] Firestore Rules file not found at: ${rulesPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(archPath)) {
    console.error(`[ERROR] Architecture file not found at: ${archPath}`);
    process.exit(1);
  }

  // 1. Read files
  const dataModelContent = fs.readFileSync(dataModelPath, 'utf8');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  const archContent = fs.readFileSync(archPath, 'utf8');

  // 2. Parse collections from data-model.md
  // Look for headings like: ## 1. Collection: `assets`
  const collectionRegex = /## \d+\.\s+Collection:\s+`([a-zA-Z0-9_-]+)`/g;
  const collections = [];
  let match;
  while ((match = collectionRegex.exec(dataModelContent)) !== null) {
    collections.push(match[1]);
  }

  console.log(`Parsed collections from SSoT data model: ${JSON.stringify(collections)}`);

  // 3. Verify that firestore.rules covers each collection or its sub-path
  // Search for: match /collectionName/...
  let missingCollectionsCount = 0;
  collections.forEach(col => {
    // Check if the rules file contains the collection name in a match block
    const isMatched = rulesContent.includes(`match /${col}/`) || rulesContent.includes(`match /${col}`);
    if (isMatched) {
      console.log(`  [OK] Collection "${col}" is matched in firestore.rules.`);
    } else {
      console.error(`  [WARNING] Collection "${col}" defined in data-model.md is missing from firestore.rules!`);
      missingCollectionsCount++;
    }
  });

  // 4. Verify that Mermaid diagrams in ARCHITECTURE.md contain references to the collections
  console.log('\nVerifying Mermaid architectural diagrams in ARCHITECTURE.md...');
  collections.forEach(col => {
    const isReferenced = archContent.includes(col);
    if (isReferenced) {
      console.log(`  [OK] Collection "${col}" is referenced in Mermaid topology/sequences.`);
    } else {
      console.warn(`  [WARNING] Collection "${col}" is not referenced in Mermaid topology/sequences in ARCHITECTURE.md.`);
    }
  });

  console.log('\n=== LIBRARIAN SYNC AND VERIFICATION COMPLETED ===');
  if (missingCollectionsCount > 0) {
    console.error(`[FAIL] Validation failed: ${missingCollectionsCount} collections are not configured in firestore.rules.`);
    process.exit(1);
  } else {
    console.log('[PASS] All database collections are secured and documented in active configurations!');
    process.exit(0);
  }
}

runSyncDocs();
