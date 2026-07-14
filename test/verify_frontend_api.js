const http = require('http');

const API_BASE = 'http://localhost:8080';

// Helper to make HTTP requests
function request(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (e) => reject(e));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function verifyManagementAPI() {
  console.log('=== VERIFYING CMS PORTAL MANAGEMENT BACKEND APIS ===');

  try {
    // 1. Test GET /api/assets (Get initial count)
    console.log('\n1. Fetching list of all assets...');
    const assetsRes = await request(`${API_BASE}/api/assets`);
    if (assetsRes.status !== 200) {
      throw new Error(`Failed to fetch assets. Status: ${assetsRes.status}`);
    }
    const initialCount = assetsRes.body.length;
    console.log(`  [PASS] Successfully retrieved ${initialCount} assets.`);

    // 2. Test GET /api/tracks
    console.log('\n2. Fetching list of curriculum tracks...');
    const tracksRes = await request(`${API_BASE}/api/tracks`);
    if (tracksRes.status !== 200) {
      throw new Error(`Failed to fetch tracks. Status: ${tracksRes.status}`);
    }
    console.log(`  [PASS] Retrieved ${tracksRes.body.length} tracks:`, tracksRes.body.map(t => t.track_name));

    // 3. Test POST /api/assets (Create new asset)
    console.log('\n3. Creating a new content asset via POST /api/assets...');
    const newAsset = {
      name: 'Verification Test Asset',
      type: 'quiz',
      version: 1,
      attributes: {
        duration: 450,
        difficulty_level: 4.8,
        skill_tags: ['verify', 'test', 'frontend-api'],
        topic: 'Network Introduction',
        comments: 'Created via verification test script'
      }
    };
    const createRes = await request(`${API_BASE}/api/assets`, 'POST', newAsset);
    if (createRes.status !== 201) {
      throw new Error(`Failed to create asset. Status: ${createRes.status}, Body: ${JSON.stringify(createRes.body)}`);
    }
    const createdId = createRes.body.asset_id;
    console.log(`  [PASS] Asset created successfully! Generated ID: ${createdId}`);

    // Verify it is listed now
    const assetsAfterCreate = await request(`${API_BASE}/api/assets`);
    console.log(`  Assets count increased from ${initialCount} to ${assetsAfterCreate.body.length}`);
    if (assetsAfterCreate.body.length !== initialCount + 1) {
      throw new Error('Assets count did not increase by 1!');
    }

    // 4. Test PUT /api/assets/:id (Modify asset)
    console.log(`\n4. Modifying asset ${createdId} via PUT /api/assets/${createdId}...`);
    const updatePayload = {
      name: 'Verification Test Asset',
      type: 'quiz',
      version: 2,
      attributes: {
        duration: 500,
        comments: 'Updated comments via verify script'
      }
    };
    const updateRes = await request(`${API_BASE}/api/assets/${createdId}`, 'PUT', updatePayload);
    if (updateRes.status !== 200) {
      throw new Error(`Failed to update asset. Status: ${updateRes.status}`);
    }
    console.log(`  [PASS] Asset updated successfully! New version: ${updateRes.body.data.version}, duration: ${updateRes.body.data.attributes.duration}s`);

    // 5. Test GET /api/cache-invalidations (Verify invalidation log was written)
    console.log('\n5. Checking cache invalidation logs...');
    // Wait a brief moment for the local triggers simulator to write the log
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const logsRes = await request(`${API_BASE}/api/cache-invalidations`);
    if (logsRes.status !== 200) {
      throw new Error(`Failed to fetch logs. Status: ${logsRes.status}`);
    }
    const matchingLog = logsRes.body.find(log => log.doc_id === createdId);
    if (!matchingLog) {
      console.log('Logs found:', logsRes.body.slice(0, 3));
      throw new Error(`No cache invalidation log found for document: ${createdId}`);
    }
    console.log(`  [PASS] Cache invalidation logged correctly! Log details:`, matchingLog);

    // 6. Test DELETE /api/assets/:id (Delete asset)
    console.log(`\n6. Deleting asset ${createdId} via DELETE /api/assets/${createdId}...`);
    const deleteRes = await request(`${API_BASE}/api/assets/${createdId}`, 'DELETE');
    if (deleteRes.status !== 200) {
      throw new Error(`Failed to delete asset. Status: ${deleteRes.status}`);
    }
    console.log(`  [PASS] Asset deleted successfully!`);

    // Verify it is removed
    const assetsAfterDelete = await request(`${API_BASE}/api/assets`);
    console.log(`  Assets count returned to: ${assetsAfterDelete.body.length}`);
    if (assetsAfterDelete.body.length !== initialCount) {
      throw new Error('Assets count did not return to initial count!');
    }

    console.log('\n=== ALL FRONT-END REST APIS FULLY VERIFIED! ===');
    process.exit(0);

  } catch (err) {
    console.error('\n=== VERIFICATION FAILED ===');
    console.error(err);
    process.exit(1);
  }
}

verifyManagementAPI();
