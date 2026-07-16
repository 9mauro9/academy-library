const http = require('http');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { getApps, initializeApp } = require('firebase-admin/app');

class AcademyLibrarySDK {
  /**
   * Initialize SDK
   * @param {Object} config Config object containing apiBaseUrl and optional firebaseConfig
   */
  constructor(config = {}) {
    this.apiBaseUrl = config.apiBaseUrl || 'http://localhost:8082';
    this.cache = new Map();
    this.invalidationListener = null;

    // Initialize Firebase if not already initialized
    if (getApps().length === 0) {
      initializeApp({
        projectId: config.projectId || 'academy-library'
      });
    }
    this.db = getFirestore();
  }

  /**
   * Helper to perform HTTP GET request
   */
  _fetchJson(url) {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        const { statusCode } = res;
        if (statusCode !== 200) {
          let errorData = '';
          res.on('data', (chunk) => { errorData += chunk; });
          res.on('end', () => {
            reject(new Error(`Request Failed. Status Code: ${statusCode}. Response: ${errorData}`));
          });
          return;
        }

        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(rawData);
            resolve(parsedData);
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', (e) => {
        reject(e);
      });
    });
  }

  /**
   * Retrieve track curriculum by ID
   * @param {string} trackId Slug of the track (e.g. 'network-foundations')
   * @param {string|number} version Version identifier ('latest' or number)
   * @param {boolean} bypassCache Force fresh retrieve
   */
  async getCurriculumTrack(trackId, version = 'latest', bypassCache = false) {
    const cacheKey = `${trackId}:${version}`;
    
    if (!bypassCache && this.cache.has(cacheKey)) {
      console.log(`[SDK] Returning cached curriculum map for ${cacheKey}`);
      return this.cache.get(cacheKey);
    }

    const url = `${this.apiBaseUrl}/content?track_id=${encodeURIComponent(trackId)}&version=${encodeURIComponent(version)}`;
    console.log(`[SDK] Fetching curriculum map from API: ${url}`);
    
    try {
      const data = await this._fetchJson(url);
      this.cache.set(cacheKey, data);
      return data;
    } catch (err) {
      console.error(`[SDK] Error fetching track ${trackId}:`, err.message);
      throw err;
    }
  }

  /**
   * Subscribe to real-time cache invalidations from Firestore.
   * Whenever an asset or curriculum document is updated, the SDK clears its cache and triggers a callback.
   * @param {Function} onInvalidateCallback Function to run when a cache invalidation event is received
   */
  subscribeToInvalidations(onInvalidateCallback) {
    if (this.invalidationListener) {
      console.log('[SDK] Already subscribed to invalidations.');
      return;
    }

    console.log('[SDK] Subscribing to Firestore cache_invalidations collection...');
    
    // Listen to changes in the cache_invalidations collection
    this.invalidationListener = this.db.collection('cache_invalidations')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .onSnapshot(snapshot => {
        if (snapshot.empty) return;
        
        const doc = snapshot.docs[0];
        const data = doc.data();
        
        console.log(`[SDK] Cache Invalidation Event received:`, data);
        
        // Clear all cached items
        this.cache.clear();
        console.log('[SDK] Local cache invalidated.');
        
        if (onInvalidateCallback) {
          onInvalidateCallback(data);
        }
      }, err => {
        console.error('[SDK] Error listening for cache invalidations:', err);
      });
  }

  /**
   * Unsubscribe from invalidations
   */
  unsubscribeFromInvalidations() {
    if (this.invalidationListener) {
      this.invalidationListener();
      this.invalidationListener = null;
      console.log('[SDK] Unsubscribed from invalidations.');
    }
  }
}

module.exports = { AcademyLibrarySDK };
