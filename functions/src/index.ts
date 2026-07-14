import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

admin.initializeApp();
const db = admin.firestore();

// Helper to initialize GenAI SDK
const getAIClient = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VERTEX_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY or VERTEX_API_KEY is not defined. Using mock AI fallbacks.");
    return null;
  }
  return new GoogleGenerativeAI(apiKey);
};

// Helper function to build the flat curriculum catalog by joining curriculum_map and assets
async function fetchCatalogFromDB() {
  const curriculumSnapshot = await db.collection('curriculum_map').get();
  const assetsSnapshot = await db.collection('assets').get();

  const assetsMap = new Map();
  assetsSnapshot.docs.forEach(doc => {
    assetsMap.set(doc.id, doc.data());
  });

  const catalog: any[] = [];
  curriculumSnapshot.docs.forEach(doc => {
    const cData = doc.data();
    const assetRefId = cData.asset_ref?.id || (cData.asset_ref?._path?.segments && cData.asset_ref._path.segments.slice(-1)[0]);
    const asset = assetRefId ? assetsMap.get(assetRefId) : null;

    if (!asset) return;

    const durationSec = asset.attributes?.duration || 1200;
    const durationMins = durationSec / 60;
    const minutes = Math.floor(durationMins);
    const seconds = Math.floor(durationSec % 60);
    const durationStr = `${minutes}:${String(seconds).padStart(2, '0')}`;

    catalog.push({
      id: doc.id,
      topic: cData.track_name || cData.topic || "General",
      lesson: cData.lesson || "General Lesson",
      asset_name: cData.asset_name || asset.name || "General Asset",
      duration: durationStr,
      durationMins: durationMins,
      description: asset.attributes?.comments || `Lesson on ${cData.lesson} focusing on ${cData.topic}.`,
      prerequisites: asset.attributes?.prerequisite && !asset.attributes.prerequisite.startsWith('=') ? asset.attributes.prerequisite : "",
      skillTag: asset.attributes?.skill_tags?.[0] || cData.topic || "Core",
      difficultyLevel: asset.attributes?.difficulty_level || 5,
      learningOutcome: `Master the concepts of ${cData.topic} and ${cData.lesson}.`
    });
  });

  return catalog;
}

// Background trigger: Generate embeddings when an asset is created or updated
export const onAssetWrite = onDocumentWritten('assets/{assetId}', async (event) => {
  const data = event.data?.after.data();
  if (!data) return;

  // Avoid infinite loops
  if (data.embedding && data.embeddingVersion === 'v1') {
    return;
  }

  const ai = getAIClient();
  const textToEmbed = `Asset: ${data.name || ''}\nType: ${data.type || ''}\nTopic: ${data.attributes?.topic || ''}\nSkill Tags: ${(data.attributes?.skill_tags || []).join(', ')}`;
  
  let vector: number[] = [];

  if (ai) {
    try {
      const embedModel = ai.getGenerativeModel({ model: 'text-embedding-004' });
      const response = await embedModel.embedContent(textToEmbed);
      if (response.embedding?.values) {
        vector = response.embedding.values;
      }
    } catch (err) {
      console.error("Error generating vector embedding:", err);
      return;
    }
  } else {
    // Generate a mock vector (768 dimensions) for emulator testing without API key
    console.log("Generating mock embedding vector...");
    vector = Array.from({ length: 768 }, () => Math.random() * 2 - 1);
  }

  if (vector.length > 0) {
    await event.data?.after.ref.update({
      embedding: vector,
      embeddingVersion: 'v1'
    });
  }
});

// Admin Callable: Process/Generate missing embeddings on demand for assets
export const processEmbeddings = onCall(async (request) => {
  const ai = getAIClient();
  const assetsSnapshot = await db.collection('assets').get();
  let updatedCount = 0;

  for (const doc of assetsSnapshot.docs) {
    const data = doc.data();
    if (!data.embedding || data.embeddingVersion !== 'v1') {
      const textToEmbed = `Asset: ${data.name || ''}\nType: ${data.type || ''}\nTopic: ${data.attributes?.topic || ''}\nSkill Tags: ${(data.attributes?.skill_tags || []).join(', ')}`;
      
      let vector: number[] = [];
      if (ai) {
        try {
          const embedModel = ai.getGenerativeModel({ model: 'text-embedding-004' });
          const response = await embedModel.embedContent(textToEmbed);
          if (response.embedding?.values) {
            vector = response.embedding.values;
          }
        } catch (err) {
          console.error(`Failed embedding for ${doc.id}:`, err);
        }
      } else {
        vector = Array.from({ length: 768 }, () => Math.random() * 2 - 1);
      }

      if (vector.length > 0) {
        await doc.ref.update({
          embedding: vector,
          embeddingVersion: 'v1'
        });
        updatedCount++;
      }
    }
  }

  return { message: `Completed processing. Updated ${updatedCount} assets with embeddings.` };
});

// Callable: Generate Learning Path from Diagnostic Assessment Sliders
export const generatePathFromDiagnostic = onCall(async (request) => {
  const { scores, maxDuration, learningDepth } = request.data as {
    scores: Record<string, number>;
    maxDuration: number;
    learningDepth: string;
  };

  if (!scores) {
    throw new HttpsError('invalid-argument', 'Proficiency scores are required.');
  }

  // Retrieve course catalog from Firestore by joining curriculum_map and assets
  const catalog = await fetchCatalogFromDB();

  if (catalog.length === 0) {
    throw new HttpsError('failed-precondition', 'The topics catalog is empty. Load courses first.');
  }

  const ai = getAIClient();
  if (!ai) {
    // Return mock path if no API key is available
    return {
      learningPath: {
        title: "Mock Recommended Path (No API Key)",
        description: "A placeholder path generated locally because the Gemini API key was not configured in the function settings.",
        totalDuration: "12 hrs 45 mins",
        sequenceStatus: "valid",
        modules: catalog.slice(0, 5)
      }
    };
  }

  const systemInstruction = `You are the Academy Builder Learning Architect. Your job is to design a personalized learning path.
Strict constraints:
1. ONLY recommend modules/lessons that exist in the provided catalog. Do NOT make up new lessons.
2. Respect prerequisite sequencing. If Lesson B lists Lesson A as a prerequisite, Lesson A MUST appear earlier in the modules list than Lesson B.
3. Keep the total duration of recommended topics within the requested maximum duration.
4. Output strictly valid JSON matching the schema below. No markdown wrapper, no prefix, no postfix.

JSON Schema format:
{
  "title": "Name of the learning path",
  "description": "Short summary of why this path matches their profile",
  "totalDuration": "Format: X hrs Y mins",
  "sequenceStatus": "valid",
  "modules": [
    {
      "topic": "Topic Name",
      "lesson": "Lesson Title",
      "duration": "Duration from catalog",
      "description": "Description from catalog",
      "difficultyLevel": 5,
      "skillTag": "Skill Tag",
      "learningOutcome": "Outcome",
      "prerequisites": "Prereqs if any"
    }
  ]
}`;

  const prompt = `Design a learning path for a student with the following details:
- Current Proficiency Scores (Scale 1-10): ${JSON.stringify(scores)}
- Target Maximum Path Duration: ${maxDuration} hours
- Learning Depth Strategy: ${learningDepth}

Available Catalog:
${JSON.stringify(catalog, null, 2)}
`;

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemInstruction
    });

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });

    const replyText = response.response.text() || '';
    const cleanJson = replyText.replace(/```json|```/g, '').trim();
    const learningPath = JSON.parse(cleanJson);

    return { learningPath };
  } catch (err: any) {
    console.error("Gemini Generation Error:", err);
    throw new HttpsError('internal', `Failed to generate recommendations: ${err.message}`);
  }
});

// Callable: RAG-based AI Architect Chat Panel
export const chatWithArchitect = onCall(async (request) => {
  const { message, history } = request.data as {
    message: string;
    history: Array<{ role: string; content: string }>;
  };

  if (!message) {
    throw new HttpsError('invalid-argument', 'Message content is required.');
  }

  const ai = getAIClient();
  
  // 1. Get search embedding vector of the user's message
  let queryVector: number[] = [];
  if (ai) {
    try {
      const embedModel = ai.getGenerativeModel({ model: 'text-embedding-004' });
      const response = await embedModel.embedContent(message);
      if (response.embedding?.values) {
        queryVector = response.embedding.values;
      }
    } catch (err) {
      console.error("Embedding generation error:", err);
    }
  }

  // 2. Query Firestore assets. If vector is available, perform vector similarity search
  let retrievedTopics: any[] = [];
  try {
    if (queryVector.length > 0) {
      const collectionRef = db.collection('assets');
      const queryRef = collectionRef.findNearest('embedding', queryVector, {
        limit: 10,
        distanceMeasure: 'COSINE'
      });
      const snapshot = await queryRef.get();
      
      const curriculumSnap = await db.collection('curriculum_map').get();
      snapshot.docs.forEach(assetDoc => {
        const asset = assetDoc.data();
        const assetId = assetDoc.id;
        
        const matches = curriculumSnap.docs.filter(doc => {
          const cData = doc.data();
          const assetRefId = cData.asset_ref?.id || (cData.asset_ref?._path?.segments && cData.asset_ref._path.segments.slice(-1)[0]);
          return assetRefId === assetId;
        });

        matches.forEach(doc => {
          const cData = doc.data();
          const durationSec = asset.attributes?.duration || 1200;
          const durationMins = durationSec / 60;
          const minutes = Math.floor(durationMins);
          const seconds = Math.floor(durationSec % 60);
          const durationStr = `${minutes}:${String(seconds).padStart(2, '0')}`;

          retrievedTopics.push({
            topic: cData.track_name || cData.topic || "General",
            lesson: cData.lesson || "General Lesson",
            asset_name: cData.asset_name || asset.name || "General Asset",
            duration: durationStr,
            durationMins: durationMins,
            description: asset.attributes?.comments || `Lesson on ${cData.lesson} focusing on ${cData.topic}.`,
            prerequisites: asset.attributes?.prerequisite && !asset.attributes.prerequisite.startsWith('=') ? asset.attributes.prerequisite : "",
            skillTag: asset.attributes?.skill_tags?.[0] || cData.topic || "Core",
            difficultyLevel: asset.attributes?.difficulty_level || 5,
            learningOutcome: `Master the concepts of ${cData.topic} and ${cData.lesson}.`
          });
        });
      });
    }
  } catch (err) {
    console.warn("Vector search failed or index not built. Falling back to collection scan...", err);
  }

  // Fallback: Fetch standard topics catalog if vector search returned nothing or failed
  if (retrievedTopics.length === 0) {
    const catalog = await fetchCatalogFromDB();
    retrievedTopics = catalog.slice(0, 30);
  }

  // Clean retrieved topics to avoid token bloat
  const cleanContext = retrievedTopics.map(t => ({
    topic: t.topic,
    lesson: t.lesson,
    duration: t.duration,
    description: t.description,
    prerequisites: t.prerequisites,
    skillTag: t.skillTag,
    difficultyLevel: t.difficultyLevel,
    learningOutcome: t.learningOutcome
  }));

  if (!ai) {
    return {
      reply: `[MOCK MODE] You asked: "${message}". Connect a valid GEMINI_API_KEY to see real AI responses. Here is a matching topic from our catalog: "${cleanContext[0]?.lesson || 'No topics available'}"`,
      learningPath: null
    };
  }

  const systemInstruction = `You are the Academy Builder Learning Architect. Your job is to answer user queries and design personalized learning paths.
Strict rules:
1. ONLY recommend modules/lessons that exist in the provided catalog. Do NOT recommend external subjects like AWS, Azure, generic Kubernetes, or Cisco unless it exists inside the provided catalog topics.
2. If the user asks for topics outside the catalog, politely explain that you are constrained to the Academy Builder topics catalog and direct them back to our topics.
3. Respect prerequisite sequencing in your advice.
4. If the user explicitly asks you to build, create, or update a learning path, you MUST output a JSON response containing two fields:
   - "reply": Your conversational explanation or advice to the user.
   - "learningPath": A structured learning path object following the schema below.
   If they do NOT ask for a path, you can set "learningPath" to null or omit it, returning only a "reply" field.

Learning Path Schema format for "learningPath":
{
  "title": "Name of the path",
  "description": "Short explanation",
  "totalDuration": "X hrs Y mins",
  "sequenceStatus": "valid",
  "modules": [
    {
      "topic": "Topic Name from catalog",
      "lesson": "Lesson Title from catalog",
      "duration": "Duration",
      "description": "Description",
      "difficultyLevel": 5,
      "skillTag": "Skill Tag",
      "learningOutcome": "Outcome",
      "prerequisites": "Prereqs"
    }
  ]
}

Output strictly valid JSON matching:
{
  "reply": "Your explanation here...",
  "learningPath": { ... } // or null
}`;

  const prompt = `User query: "${message}"

Recent chat history for context:
${JSON.stringify(history)}

Matching course catalog context to construct your answer from:
${JSON.stringify(cleanContext, null, 2)}
`;

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemInstruction
    });

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });

    const replyText = response.response.text() || '';
    const cleanJson = replyText.replace(/```json|```/g, '').trim();
    const data = JSON.parse(cleanJson);

    return data;
  } catch (err: any) {
    console.error("Gemini Chat Error:", err);
    throw new HttpsError('internal', `Failed to generate reply: ${err.message}`);
  }
});
