const assert = require('assert');
const http = require('http');
const { validateTaxonomyPath, inferTaxonomy, PRIMARY_BUCKET, TAXONOMY_RULES } = require('../api/taxonomy.cjs');

console.log('====================================================');
console.log('   VERIFYING HIERARCHICAL HYBRID STORAGE TAXONOMY   ');
console.log('====================================================');

// Test 1: Unit Validation of Taxonomy Rules
console.log('\n--- Test 1: Unit Taxonomy Validation ---');

const validCases = [
  { path: 'curriculum/videos/intro.mp4', expectedDomain: 'curriculum', expectedCat: 'videos' },
  { path: 'curriculum/videos/lecture.mkv', expectedDomain: 'curriculum', expectedCat: 'videos' },
  { path: 'curriculum/diagrams/topology.svg', expectedDomain: 'curriculum', expectedCat: 'diagrams' },
  { path: 'curriculum/diagrams/rack.png', expectedDomain: 'curriculum', expectedCat: 'diagrams' },
  { path: 'curriculum/documents/slides.ppt', expectedDomain: 'curriculum', expectedCat: 'documents' },
  { path: 'curriculum/documents/guide.pdf', expectedDomain: 'curriculum', expectedCat: 'documents' },
  { path: 'marketing/documents/brochure.pdf', expectedDomain: 'marketing', expectedCat: 'documents' },
  { path: 'marketing/media/promo.mp4', expectedDomain: 'marketing', expectedCat: 'media' },
  { path: 'platform/exports/dump.json', expectedDomain: 'platform', expectedCat: 'exports' },
  { path: 'platform/exports/backup.zip', expectedDomain: 'platform', expectedCat: 'exports' },
  { path: 'gs://academy-content-bucket/curriculum/videos/test.mp4', expectedDomain: 'curriculum', expectedCat: 'videos' }
];

validCases.forEach(({ path, expectedDomain, expectedCat }) => {
  const result = validateTaxonomyPath(path);
  assert.strictEqual(result.valid, true, `Path '${path}' should be valid`);
  assert.strictEqual(result.domain, expectedDomain, `Domain for '${path}' should be '${expectedDomain}'`);
  assert.strictEqual(result.asset_category, expectedCat, `Category for '${path}' should be '${expectedCat}'`);
  console.log(`  ✓ Validated path: ${path} => Domain: ${result.domain}, Category: ${result.asset_category}`);
});

const invalidCases = [
  'invalid/path/file.mp4',
  'curriculum/videos/file.exe',
  'curriculum/diagrams/doc.pdf',
  'marketing/media/image.png',
  'random_folder/file.pdf'
];

invalidCases.forEach(path => {
  const result = validateTaxonomyPath(path);
  assert.strictEqual(result.valid, false, `Path '${path}' should be invalid`);
  console.log(`  ✓ Rejected invalid path/extension: ${path} (${result.error})`);
});

// Test 2: Inferred Taxonomy Fallbacks
console.log('\n--- Test 2: Taxonomy Inferencing Fallbacks ---');
const inferred1 = inferTaxonomy(null, 'video', 'BGP Fundamentals');
assert.strictEqual(inferred1.domain, 'curriculum');
assert.strictEqual(inferred1.asset_category, 'videos');
assert.strictEqual(inferred1.gcs_uri, 'gs://academy-content-bucket/curriculum/videos/bgp-fundamentals.mp4');
console.log(`  ✓ Inferred video taxonomy: ${inferred1.gcs_uri}`);

const inferred2 = inferTaxonomy(null, 'document', 'Lab Guide');
assert.strictEqual(inferred2.domain, 'curriculum');
assert.strictEqual(inferred2.asset_category, 'documents');
assert.strictEqual(inferred2.gcs_uri, 'gs://academy-content-bucket/curriculum/documents/lab-guide.pdf');
console.log(`  ✓ Inferred document taxonomy: ${inferred2.gcs_uri}`);

// Test 3: API Integration Tests
console.log('\n--- Test 3: REST API Integration Endpoints ---');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function runApiTests() {
  const serverPort = 8082;
  
  // 3a. Test Signed URL Generation with Invalid Path (Expect 400)
  const invalidSignedUrlResp = await makeRequest({
    hostname: 'localhost',
    port: serverPort,
    path: '/api/v1/assets/signed-url',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { destinationPath: 'unauthorized/folder/test.exe' });

  assert.strictEqual(invalidSignedUrlResp.status, 400, 'Invalid taxonomy path must return HTTP 400');
  assert.strictEqual(invalidSignedUrlResp.data.error, 'Taxonomy validation failed');
  console.log('  ✓ POST /api/v1/assets/signed-url correctly rejected invalid taxonomy path with HTTP 400 Bad Request.');

  // 3b. Test Signed URL Generation with Valid Path (Expect 200)
  const validSignedUrlResp = await makeRequest({
    hostname: 'localhost',
    port: serverPort,
    path: '/api/v1/assets/signed-url',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { destinationPath: 'curriculum/videos/bgp_lecture.mp4' });

  assert.strictEqual(validSignedUrlResp.status, 200, 'Valid taxonomy path must return HTTP 200');
  assert.strictEqual(validSignedUrlResp.data.domain, 'curriculum');
  assert.strictEqual(validSignedUrlResp.data.asset_category, 'videos');
  assert.strictEqual(validSignedUrlResp.data.gcs_uri, 'gs://academy-content-bucket/curriculum/videos/bgp_lecture.mp4');
  console.log(`  ✓ POST /api/v1/assets/signed-url issued signed URL for: ${validSignedUrlResp.data.gcs_uri}`);

  // 3c. Test Decoupled Asset Version Endpoint
  const assetsResp = await makeRequest({
    hostname: 'localhost',
    port: serverPort,
    path: '/api/assets',
    method: 'GET'
  });

  const testAssetId = (assetsResp.status === 200 && Array.isArray(assetsResp.data) && assetsResp.data.length > 0)
    ? assetsResp.data[0].asset_id
    : 'asset_bgp_intro_v1';

  const versionResp = await makeRequest({
    hostname: 'localhost',
    port: serverPort,
    path: `/api/v1/assets/${testAssetId}/version`,
    method: 'GET'
  });

  assert.strictEqual(versionResp.status, 200, `Version endpoint for '${testAssetId}' must return HTTP 200`);
  assert.ok(versionResp.data.domain, 'Version response must contain domain');
  assert.ok(versionResp.data.asset_category, 'Version response must contain asset_category');
  assert.ok(versionResp.data.gcs_uri, 'Version response must contain gcs_uri');
  assert.ok(versionResp.data.content_hash, 'Version response must contain content_hash');
  console.log(`  ✓ GET /api/v1/assets/${testAssetId}/version returned decoupled asset state (domain: ${versionResp.data.domain}, category: ${versionResp.data.asset_category}, gcs_uri: ${versionResp.data.gcs_uri})`);

  console.log('\n====================================================');
  console.log('  ALL TAXONOMY VERIFICATION TESTS PASSED SUCCESSFULLY!  ');
  console.log('====================================================\n');
}

runApiTests().catch(err => {
  console.error('\n❌ Taxonomy Verification Failed:', err);
  process.exit(1);
});
