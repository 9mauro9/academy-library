/**
 * Hierarchical Hybrid Storage Specification - Path Taxonomy & Validation Module
 */

const PRIMARY_BUCKET = 'gs://academy-content-bucket/';
const PRIMARY_BUCKET_NAME = 'academy-content-bucket';

// Folder taxonomy map: prefix -> allowed extensions
const TAXONOMY_RULES = {
  'curriculum/videos/': {
    domain: 'curriculum',
    category: 'videos',
    allowedExtensions: ['.mp4', '.mkv']
  },
  'curriculum/diagrams/': {
    domain: 'curriculum',
    category: 'diagrams',
    allowedExtensions: ['.svg', '.png']
  },
  'curriculum/documents/': {
    domain: 'curriculum',
    category: 'documents',
    allowedExtensions: ['.ppt', '.pdf']
  },
  'marketing/documents/': {
    domain: 'marketing',
    category: 'documents',
    allowedExtensions: ['.pdf']
  },
  'marketing/media/': {
    domain: 'marketing',
    category: 'media',
    allowedExtensions: ['.mp4']
  },
  'platform/exports/': {
    domain: 'platform',
    category: 'exports',
    allowedExtensions: ['.json', '.csv', '.dump', '.tar', '.gz', '.zip', '.xml', '.bin', '.bak', '.sql']
  }
};

/**
 * Validates a destination path against the Hierarchical Hybrid Storage Specification taxonomy.
 * @param {string} destinationPath Relative path (e.g. 'curriculum/videos/intro.mp4') or full GCS URI
 * @returns {Object} { valid: boolean, domain: string|null, asset_category: string|null, error: string|null }
 */
function validateTaxonomyPath(destinationPath) {
  if (!destinationPath || typeof destinationPath !== 'string') {
    return {
      valid: false,
      domain: null,
      asset_category: null,
      error: 'Destination path must be a non-empty string.'
    };
  }

  // Strip gs:// prefix or leading slashes if present
  let cleanPath = destinationPath.trim();
  if (cleanPath.startsWith(PRIMARY_BUCKET)) {
    cleanPath = cleanPath.slice(PRIMARY_BUCKET.length);
  } else if (cleanPath.startsWith('gs://')) {
    const parts = cleanPath.slice(5).split('/');
    parts.shift(); // remove bucket name
    cleanPath = parts.join('/');
  }
  cleanPath = cleanPath.replace(/^\/+/, '');

  let matchedPrefix = null;
  let matchedRule = null;

  for (const [prefix, rule] of Object.entries(TAXONOMY_RULES)) {
    if (cleanPath.startsWith(prefix)) {
      matchedPrefix = prefix;
      matchedRule = rule;
      break;
    }
  }

  if (!matchedRule) {
    return {
      valid: false,
      domain: null,
      asset_category: null,
      error: `Path '${destinationPath}' violates storage taxonomy. Must start with one of: ${Object.keys(TAXONOMY_RULES).join(', ')}`
    };
  }

  const filename = cleanPath.slice(matchedPrefix.length);
  if (!filename) {
    return {
      valid: false,
      domain: matchedRule.domain,
      asset_category: matchedRule.category,
      error: `Path '${destinationPath}' is missing a target file name.`
    };
  }

  const dotIdx = filename.lastIndexOf('.');
  const ext = dotIdx !== -1 ? filename.slice(dotIdx).toLowerCase() : '';

  if (!ext || !matchedRule.allowedExtensions.includes(ext)) {
    return {
      valid: false,
      domain: matchedRule.domain,
      asset_category: matchedRule.category,
      error: `File extension '${ext}' is not allowed for path '${matchedPrefix}'. Allowed extensions: ${matchedRule.allowedExtensions.join(', ')}`
    };
  }

  return {
    valid: true,
    domain: matchedRule.domain,
    asset_category: matchedRule.category,
    cleanPath: cleanPath,
    fullGcsUri: `${PRIMARY_BUCKET}${cleanPath}`,
    error: null
  };
}

/**
 * Infer taxonomy details for existing assets based on GCS URI or type
 */
function inferTaxonomy(gcsUri, assetType, name) {
  if (gcsUri) {
    const validation = validateTaxonomyPath(gcsUri);
    if (validation.valid) {
      return {
        domain: validation.domain,
        asset_category: validation.asset_category,
        gcs_uri: validation.fullGcsUri
      };
    }
  }

  let domain = 'curriculum';
  let category = 'videos';
  let ext = 'mp4';

  const typeStr = (assetType || '').toLowerCase();
  if (typeStr.includes('document') || typeStr.includes('pdf') || typeStr.includes('slide')) {
    category = 'documents';
    ext = 'pdf';
  } else if (typeStr.includes('diagram') || typeStr.includes('image') || typeStr.includes('topology')) {
    category = 'diagrams';
    ext = 'png';
  } else if (typeStr.includes('export') || typeStr.includes('dump')) {
    domain = 'platform';
    category = 'exports';
    ext = 'json';
  }

  const slug = (name || 'asset').toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[-\s]+/g, '-');
  const inferredPath = `${domain}/${category}/${slug}.${ext}`;

  return {
    domain: domain,
    asset_category: category,
    gcs_uri: `${PRIMARY_BUCKET}${inferredPath}`
  };
}

module.exports = {
  PRIMARY_BUCKET,
  PRIMARY_BUCKET_NAME,
  TAXONOMY_RULES,
  validateTaxonomyPath,
  inferTaxonomy
};
