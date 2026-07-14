import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInAnonymously as firebaseSignInAnonymously,
  onAuthStateChanged as firebaseOnAuthStateChanged
} from 'firebase/auth';
import { collection, getDocs, writeBatch, doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase';
// Check if we should use Offline Sandbox Mode
export const isSandboxMode = () => {
  return false;
};

export const setSandboxMode = (val: boolean) => {
  localStorage.setItem('academy_builder_sandbox_mode', val ? 'true' : 'false');
};

// Mock User structure
const mockUser = {
  uid: 'mock-user-123',
  email: 'sandbox.guest@academybuilder.com',
  isAnonymous: true
};

// --- AUTH SERVICES ---

export const loginUser = async (email: string, pass: string) => {
  if (isSandboxMode()) {
    localStorage.setItem('academy_builder_mock_user', JSON.stringify({ uid: 'mock-user-123', email, isAnonymous: false }));
    return { user: { email, uid: 'mock-user-123' } };
  }
  return signInWithEmailAndPassword(auth, email, pass);
};

export const registerUser = async (email: string, pass: string) => {
  if (isSandboxMode()) {
    localStorage.setItem('academy_builder_mock_user', JSON.stringify({ uid: 'mock-user-123', email, isAnonymous: false }));
    return { user: { email, uid: 'mock-user-123' } };
  }
  return createUserWithEmailAndPassword(auth, email, pass);
};

export const signInAnonymously = async () => {
  if (isSandboxMode()) {
    localStorage.setItem('academy_builder_mock_user', JSON.stringify(mockUser));
    return { user: mockUser };
  }
  
  try {
    return await firebaseSignInAnonymously(auth);
  } catch (err: any) {
    console.warn("Firebase Auth Emulator not running. Defaulting to Sandbox Mode...", err);
    setSandboxMode(true);
    localStorage.setItem('academy_builder_mock_user', JSON.stringify(mockUser));
    return { user: mockUser };
  }
};

export const subscribeToAuth = (callback: (user: any) => void) => {
  if (isSandboxMode()) {
    const saved = localStorage.getItem('academy_builder_mock_user');
    callback(saved ? JSON.parse(saved) : null);
    return () => {};
  }

  return firebaseOnAuthStateChanged(auth, (user) => {
    if (user) {
      callback(user);
    } else {
      // Check if sandbox has a logged in user
      const saved = localStorage.getItem('academy_builder_mock_user');
      if (saved && isSandboxMode()) {
        callback(JSON.parse(saved));
      } else {
        callback(null);
      }
    }
  });
};

export const logoutUser = async () => {
  localStorage.removeItem('academy_builder_mock_user');
  if (!isSandboxMode()) {
    try {
      await auth.signOut();
    } catch (e) {
      console.error(e);
    }
  }
};

// --- DATA SERVICES (Firestore & Cloud Functions) ---

// Get all topics
export const fetchTopics = async () => {
  if (isSandboxMode()) {
    const saved = localStorage.getItem('academy_builder_topics');
    const catalog = saved ? JSON.parse(saved) : getMockCatalog();
    return catalog.map((item: any, index: number) => ({
      ...item,
      sorting: item.sorting !== undefined ? item.sorting : index
    }));
  }

  const curriculumSnap = await getDocs(collection(db, 'curriculum_map'));
  const assetsSnap = await getDocs(collection(db, 'assets'));
  
  const assetsMap = new Map();
  assetsSnap.forEach((doc) => {
    assetsMap.set(doc.id, doc.data());
  });

  const list: any[] = [];
  curriculumSnap.forEach((doc) => {
    const cData = doc.data();
    const assetRefId = cData.asset_ref?.id || (cData.asset_ref?._path?.segments && cData.asset_ref._path.segments.slice(-1)[0]);
    const asset = assetRefId ? assetsMap.get(assetRefId) : null;
    if (!asset) return;

    const durationSec = asset.attributes?.duration || 1200;
    const durationMins = durationSec / 60;
    const minutes = Math.floor(durationMins);
    const seconds = Math.floor(durationSec % 60);
    const durationStr = `${minutes}:${String(seconds).padStart(2, '0')}`;

    list.push({
      id: doc.id,
      topic: cData.track_name || cData.topic || "General",
      lesson: cData.lesson || "General Lesson",
      asset_name: cData.asset_name || asset.name || "General Asset",
      duration: durationStr,
      durationMins: durationMins,
      description: (asset.attributes?.skill_tags && asset.attributes.skill_tags.length > 0) ? asset.attributes.skill_tags.join(', ') : (cData.topic || "Core"),
      prerequisites: asset.attributes?.prerequisite && !asset.attributes.prerequisite.startsWith('=') ? asset.attributes.prerequisite : "",
      skillTag: asset.attributes?.skill_tags?.[0] || cData.topic || "Core",
      difficultyLevel: asset.attributes?.difficulty_level || 5,
      learningOutcome: `Master the concepts of ${cData.topic} and ${cData.lesson}.`,
      curriculumTopic: cData.topic || "",
      subTrack: cData.sub_track || "",
      embedding: asset.embedding || null,
      sorting: cData.sorting || 999,
      track_id: cData.track_id || ""
    });
  });
  return list;
};

// Save a list of topics (decomposes into normalized assets and curriculum_map documents)
export const saveTopicsList = async (topics: any[]) => {
  if (isSandboxMode()) {
    localStorage.setItem('academy_builder_topics', JSON.stringify(topics));
    return;
  }

  const batch = writeBatch(db);
  topics.forEach((item) => {
    // Slugify and construct a unique ID for the asset
    const slugify = (text: string) => text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[-\s]+/g, '-');
    const assetId = slugify(item.lesson || "unknown-asset");
    const assetDocRef = doc(db, 'assets', assetId);
    
    // Decompose into asset details
    const assetData = {
      name: item.lesson,
      type: 'video', // Default type
      version: 1,
      is_latest: true,
      attributes: {
        duration: (item.durationMins || 20) * 60,
        prerequisite: item.prerequisites || "",
        difficulty_level: item.difficultyLevel || 5,
        skill_tags: item.skillTag ? [item.skillTag] : [],
        topic: item.topic || "General"
      }
    };
    batch.set(assetDocRef, assetData);

    // Decompose into curriculum_map details
    const curriculumDocRef = doc(collection(db, 'curriculum_map'));
    const curriculumData = {
      track_id: slugify(item.topic || "unknown-track"),
      track_name: item.topic,
      sub_track: "General",
      lesson: item.lesson,
      topic: item.topic,
      asset_name: item.lesson,
      asset_ref: assetDocRef,
      version: 1,
      is_latest: true,
      sorting: {
        track_number: 1,
        sub_track_number: 1,
        lesson_number: 1,
        topic_number: 1,
        sub_topic_number: 1
      }
    };
    batch.set(curriculumDocRef, curriculumData);
  });
  await batch.commit();
};

// Save a learning path to user profile
export const saveLearningPath = async (userId: string, path: any) => {
  if (isSandboxMode()) {
    const key = `academy_builder_paths_${userId}`;
    const saved = localStorage.getItem(key);
    const paths = saved ? JSON.parse(saved) : [];
    paths.push({ ...path, savedAt: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(paths));
    return;
  }

  const pathId = path.id || `path-${Date.now()}`;
  const userPathRef = doc(db, 'users', userId, 'learning_paths', pathId);
  await setDoc(userPathRef, {
    ...path,
    id: pathId,
    savedAt: new Date().toISOString()
  });
};

// Trigger embedding processing
export const triggerEmbeddingGeneration = async () => {
  if (isSandboxMode()) {
    // Simulate embedding generation by adding embeddings to mock data
    const topics = await fetchTopics();
    const updated = topics.map((t: any) => ({
      ...t,
      embedding: Array.from({ length: 768 }, () => Math.random() * 2 - 1)
    }));
    localStorage.setItem('academy_builder_topics', JSON.stringify(updated));
    return { message: "Sandbox Mode: Successfully simulated vector embedding generation for all topics." };
  }

  const processEmbeddings = httpsCallable(functions, 'processEmbeddings');
  const res: any = await processEmbeddings();
  return res.data;
};

// Generate Recommendation Path
// Local path recommendation logic querying the database catalog
const generateLocalPath = async (
  scores: Record<string, number>,
  settings: { duration: number; speed: string }
) => {
  const catalog = await fetchTopics();

  // Helper to compute track scores from the 12 detailed sliders
  const getMappedScore = (topicName: string) => {
    const getVal = (key: string) => scores[key] !== undefined ? scores[key] : 5;
    
    if (topicName === 'Network Foundations') {
      return (getVal('OSI Model/Layers 1–3') + getVal('TCP/IP & Subnetting') + getVal('Core Protocols')) / 3;
    }
    if (topicName === 'Data Center') {
      return (getVal('EOS Familiarity') + getVal('Leaf-Spine Architecture') + getVal('VXLAN/EVPN Concepts') + getVal('Data Center Operations')) / 4;
    }
    if (topicName === 'Campus') {
      return (getVal('Campus Network Design') + getVal('OSI Model/Layers 1–3')) / 2;
    }
    if (topicName === 'Automation') {
      return (getVal('Network Automation & Scripting') + getVal('Telemetry & Monitoring')) / 2;
    }
    if (topicName === 'WAN Routing') {
      return (getVal('Core Protocols') + getVal('Troubleshooting Methodology')) / 2;
    }
    return 5;
  };
  
  // Filter items matching the user's proficiency level
  const filtered = catalog.filter((c: any) => {
    const topicScore = getMappedScore(c.topic);
    const diff = c.difficultyLevel || 5;
    return diff <= topicScore + 2; 
  });

  // Sort them so that foundational/easy topics appear first
  const sorted = filtered.sort((a: any, b: any) => {
    if (a.difficultyLevel !== b.difficultyLevel) {
      return a.difficultyLevel - b.difficultyLevel;
    }
    return a.topic.localeCompare(b.topic);
  });

  // Accumulate modules up to the target path duration (in minutes)
  const targetMins = settings.duration * 60;
  let currentMins = 0;
  const selected: any[] = [];
  
  for (const c of sorted) {
    if (currentMins >= targetMins) {
      break;
    }
    selected.push(c);
    currentMins += c.durationMins || 20;
  }

  // Estimate durations and build modules list
  let totalMins = 0;
  const modules = selected.map((c: any) => {
    totalMins += c.durationMins || 20;
    return {
      topic: c.topic,
      lesson: c.lesson,
      duration: c.duration || "20:00",
      description: c.description || "Overview description.",
      difficultyLevel: c.difficultyLevel || 5,
      skillTag: c.skillTag || "Core",
      learningOutcome: c.learningOutcome || "Understand key concepts.",
      prerequisites: c.prerequisites || "",
      curriculumTopic: c.curriculumTopic || "",
      subTrack: c.subTrack || "",
      asset_name: c.asset_name || ""
    };
  });

  const hours = Math.floor(totalMins / 60);
  const mins = Math.round(totalMins % 60);

  // Sort final modules list by track order, then lesson sequence index (sorting)
  const getTrackWeight = (topicName: string) => {
    const t = topicName.toLowerCase().trim();
    if (t.includes("network foundation") || t.includes("foundation")) return 1;
    if (t.includes("data center") || t.includes("dc") || t.includes("eos") || t.includes("vxlan")) return 2;
    if (t.includes("campus")) return 3;
    return 99;
  };

  const sortedModules = [...modules].sort((a: any, b: any) => {
    const weightA = getTrackWeight(a.topic);
    const weightB = getTrackWeight(b.topic);
    if (weightA !== weightB) return weightA - weightB;

    const catA = catalog.find((item: any) => item.lesson.toLowerCase().trim() === a.lesson.toLowerCase().trim());
    const catB = catalog.find((item: any) => item.lesson.toLowerCase().trim() === b.lesson.toLowerCase().trim());
    
    const sortA = catA ? catA.sorting : null;
    const sortB = catB ? catB.sorting : null;
    if (sortA && sortB) {
      const subTrackA = sortA.sub_track_number !== undefined ? sortA.sub_track_number : 999;
      const subTrackB = sortB.sub_track_number !== undefined ? sortB.sub_track_number : 999;
      if (subTrackA !== subTrackB) return subTrackA - subTrackB;

      const lessonA = sortA.lesson_number !== undefined ? sortA.lesson_number : 999;
      const lessonB = sortB.lesson_number !== undefined ? sortB.lesson_number : 999;
      if (lessonA !== lessonB) return lessonA - lessonB;

      const topicA_num = sortA.topic_number !== undefined ? sortA.topic_number : 999;
      const topicB_num = sortB.topic_number !== undefined ? sortB.topic_number : 999;
      if (topicA_num !== topicB_num) return topicA_num - topicB_num;

      const subTopicA = sortA.sub_topic_number !== undefined ? sortA.sub_topic_number : 999;
      const subTopicB = sortB.sub_topic_number !== undefined ? sortB.sub_topic_number : 999;
      if (subTopicA !== subTopicB) return subTopicA - subTopicB;
    }

    return (a.difficultyLevel || 5) - (b.difficultyLevel || 5);
  });

  return {
    learningPath: {
      title: `Path Recommendation: ${settings.speed.toUpperCase()} ${settings.duration}-Hour Track`,
      description: `Generated from active database topics. Personalized curriculum mapping your assessments.`,
      totalDuration: `${hours} hrs ${mins} mins`,
      sequenceStatus: "valid",
      modules: sortedModules
    }
  };
};

// Local conversational responses querying the database catalog
const generateLocalChatResponse = (
  message: string,
  _history: Array<{ role: string; content: string }>,
  catalog: any[]
) => {
  const text = message.toLowerCase();
  let reply = "";
  let learningPath: any = null;

  if (text.includes("path") || text.includes("track") || text.includes("generate") || text.includes("design")) {
    let selected = catalog;
    if (text.includes("data center") || text.includes("dc") || text.includes("eos") || text.includes("vxlan")) {
      selected = catalog.filter(c => c.topic === "Data Center" || c.topic.toLowerCase().includes("data center") || c.topic.toLowerCase().includes("eos") || c.topic.toLowerCase().includes("vxlan"));
    } else if (text.includes("foundation") || text.includes("network") || text.includes("osi") || text.includes("subnet")) {
      selected = catalog.filter(c => c.topic === "Network Foundations" || c.topic.toLowerCase().includes("network") || c.topic.toLowerCase().includes("foundations") || c.topic.toLowerCase().includes("osi") || c.topic.toLowerCase().includes("subnet"));
    } else if (text.includes("campus")) {
      selected = catalog.filter(c => c.topic === "Campus" || c.topic.toLowerCase().includes("campus"));
    }

    // Parse target duration (default to 8 hours unless user asks for more)
    let targetHours = 8;
    const dayMatch = text.match(/(\d+)\s*day/);
    const hourMatch = text.match(/(\d+)\s*hour/);
    if (dayMatch) {
      targetHours = parseInt(dayMatch[1], 10) * 6; // 6 hours of learning content per day
    } else if (hourMatch) {
      targetHours = parseInt(hourMatch[1], 10);
    }

    // Sort available matching topics by difficulty level ascending (easiest to most difficult)
    const sorted = [...selected].sort((a, b) => (a.difficultyLevel || 5) - (b.difficultyLevel || 5));

    let totalMins = 0;
    const modules: any[] = [];
    for (const c of sorted) {
      if (totalMins >= targetHours * 60) break;
      totalMins += c.durationMins || 20;
      modules.push({
        topic: c.topic,
        lesson: c.lesson,
        duration: c.duration || "20:00",
        description: c.description,
        difficultyLevel: c.difficultyLevel,
        skillTag: c.skillTag,
        learningOutcome: c.learningOutcome,
        prerequisites: c.prerequisites,
        curriculumTopic: c.curriculumTopic || "",
        subTrack: c.subTrack || "",
        asset_name: c.asset_name || ""
      });
    }

    // Supplement from other catalog elements if matching set is shorter than targetHours
    if (totalMins < targetHours * 60) {
      const rest = catalog
        .filter(c => !modules.some(m => m.lesson === c.lesson))
        .sort((a, b) => (a.difficultyLevel || 5) - (b.difficultyLevel || 5));
      for (const c of rest) {
        if (totalMins >= targetHours * 60) break;
        totalMins += c.durationMins || 20;
        modules.push({
          topic: c.topic,
          lesson: c.lesson,
          duration: c.duration || "20:00",
          description: c.description,
          difficultyLevel: c.difficultyLevel,
          skillTag: c.skillTag,
          learningOutcome: c.learningOutcome,
          prerequisites: c.prerequisites,
          curriculumTopic: c.curriculumTopic || "",
          subTrack: c.subTrack || "",
          asset_name: c.asset_name || ""
        });
      }
    }

    const hours = Math.floor(totalMins / 60);
    const mins = Math.round(totalMins % 60);

    reply = `I have designed a custom learning path for you based on our catalog: "${modules[0]?.topic || 'Academy'} Foundations". It consists of ${modules.length} sequential modules. You can view it mapped on your workspace timeline.`;
    const getTrackWeight = (topicName: string) => {
      const t = topicName.toLowerCase().trim();
      if (t.includes("network foundation") || t.includes("foundation")) return 1;
      if (t.includes("data center") || t.includes("dc") || t.includes("eos") || t.includes("vxlan")) return 2;
      if (t.includes("campus")) return 3;
      return 99;
    };

    const sortedModules = [...modules].sort((a: any, b: any) => {
      const weightA = getTrackWeight(a.topic);
      const weightB = getTrackWeight(b.topic);
      if (weightA !== weightB) return weightA - weightB;

      const catA = catalog.find((item: any) => item.lesson.toLowerCase().trim() === a.lesson.toLowerCase().trim());
      const catB = catalog.find((item: any) => item.lesson.toLowerCase().trim() === b.lesson.toLowerCase().trim());
      
      const sortA = catA ? catA.sorting : null;
      const sortB = catB ? catB.sorting : null;
      if (sortA && sortB) {
        const subTrackA = sortA.sub_track_number !== undefined ? sortA.sub_track_number : 999;
        const subTrackB = sortB.sub_track_number !== undefined ? sortB.sub_track_number : 999;
        if (subTrackA !== subTrackB) return subTrackA - subTrackB;

        const lessonA = sortA.lesson_number !== undefined ? sortA.lesson_number : 999;
        const lessonB = sortB.lesson_number !== undefined ? sortB.lesson_number : 999;
        if (lessonA !== lessonB) return lessonA - lessonB;

        const topicA_num = sortA.topic_number !== undefined ? sortA.topic_number : 999;
        const topicB_num = sortB.topic_number !== undefined ? sortB.topic_number : 999;
        if (topicA_num !== topicB_num) return topicA_num - topicB_num;

        const subTopicA = sortA.sub_topic_number !== undefined ? sortA.sub_topic_number : 999;
        const subTopicB = sortB.sub_topic_number !== undefined ? sortB.sub_topic_number : 999;
        if (subTopicA !== subTopicB) return subTopicA - subTopicB;
      }

      return (a.difficultyLevel || 5) - (b.difficultyLevel || 5);
    });

    learningPath = {
      title: `Custom AI Path: ${sortedModules[0]?.topic || 'Academy'}`,
      description: `Path created via conversational request: "${message}"`,
      totalDuration: `${hours} hrs ${mins} mins`,
      sequenceStatus: "valid",
      modules: sortedModules
    };
  } else if (text.includes("aws") || text.includes("cisco") || text.includes("azure") || text.includes("cloud")) {
    reply = `I am sorry, but I am the Academy Builder Learning Architect and I am constrained strictly to the Academy Builder topics catalog. We do not have modules matching "${message}" in our catalog. I recommend you look at our Network Foundations or Data Center Engineering courses.`;
  } else {
    reply = `As the Academy Builder Learning Architect, I can help you build custom learning roadmaps. I found ${catalog.length} topics in our catalog. If you would like me to compile a course timeline, please ask something like "Design a path for Data Center Engineering".`;
  }

  return { reply, learningPath };
};

// Generate Recommendation Path
export const generatePath = async (
  scores: Record<string, number>, 
  settings: { duration: number; speed: string }
) => {
  try {
    const generatePathFromDiagnostic = httpsCallable(functions, 'generatePathFromDiagnostic');
    const res: any = await generatePathFromDiagnostic({
      scores,
      maxDuration: settings.duration,
      learningDepth: settings.speed
    });
    if (res && res.data && res.data.learningPath) {
      return res.data;
    }
  } catch (err) {
    console.warn("Cloud function failed. Falling back to local database-based sequence logic...", err);
  }

  return generateLocalPath(scores, settings);
};

// Send AI chat message
export const sendChatMessage = async (
  message: string, 
  history: Array<{ role: string; content: string }>
) => {
  try {
    const chatWithArchitect = httpsCallable(functions, 'chatWithArchitect');
    const res: any = await chatWithArchitect({ message, history });
    if (res && res.data) {
      return res.data;
    }
  } catch (err) {
    console.warn("Cloud function failed. Falling back to local database-based chat response...", err);
  }

  const catalog = await fetchTopics();
  return generateLocalChatResponse(message, history, catalog);
};

const getMockCatalog = () => [
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "Introduction to Networks",
    duration: "35:03",
    durationMins: 35.05,
    description: "network definition",
    prerequisites: "",
    skillTag: "network definition",
    difficultyLevel: 1,
    learningOutcome: "Master the concepts of Network Introduction and Network Engineering Fundamentals.",
    curriculumTopic: "Network Introduction",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "Introduction to Network Models",
    duration: "8:45",
    durationMins: 8.75,
    description: "network models",
    prerequisites: "",
    skillTag: "network models",
    difficultyLevel: 1,
    learningOutcome: "Master the concepts of Network Introduction and Network Engineering Fundamentals.",
    curriculumTopic: "Network Introduction",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "OSI in Action",
    duration: "39:29",
    durationMins: 39.48,
    description: "OSI",
    prerequisites: "",
    skillTag: "OSI",
    difficultyLevel: 2,
    learningOutcome: "Master the concepts of Network Introduction and Network Engineering Fundamentals.",
    curriculumTopic: "Network Introduction",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "Wireshark and TCP/IP",
    duration: "7:48",
    durationMins: 7.8,
    description: "wireshark",
    prerequisites: "",
    skillTag: "wireshark",
    difficultyLevel: 3,
    learningOutcome: "Master the concepts of Network Introduction and Network Engineering Fundamentals.",
    curriculumTopic: "Network Introduction",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "Cabling and Connectivity - Part 1 - Copper and PoE",
    duration: "23:07",
    durationMins: 23.12,
    description: "physical layer",
    prerequisites: "",
    skillTag: "physical layer",
    difficultyLevel: 1,
    learningOutcome: "Master the concepts of Physical Layer and Network Engineering Fundamentals.",
    curriculumTopic: "Physical Layer",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "Cabling and Connectivity - Part 2 - Fiber and Wireless",
    duration: "22:02",
    durationMins: 22.03,
    description: "fiber optics",
    prerequisites: "",
    skillTag: "fiber optics",
    difficultyLevel: 2,
    learningOutcome: "Master the concepts of Physical Layer and Network Engineering Fundamentals.",
    curriculumTopic: "Physical Layer",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "Ethernet and MAC Address",
    duration: "30:24",
    durationMins: 30.4,
    description: "LAN",
    prerequisites: "",
    skillTag: "LAN",
    difficultyLevel: 2,
    learningOutcome: "Master the concepts of Data Link Layer and Network Engineering Fundamentals.",
    curriculumTopic: "Data Link Layer",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "L2 Devices Learning and Forwarding",
    duration: "40:14",
    durationMins: 40.23,
    description: "message types",
    prerequisites: "",
    skillTag: "message types",
    difficultyLevel: 3,
    learningOutcome: "Master the concepts of Data Link Layer and Network Engineering Fundamentals.",
    curriculumTopic: "Data Link Layer",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "Introduction to IPv4",
    duration: "25:57",
    durationMins: 25.95,
    description: "IPv4 address",
    prerequisites: "",
    skillTag: "IPv4 address",
    difficultyLevel: 2,
    learningOutcome: "Master the concepts of Network Layer and Network Engineering Fundamentals.",
    curriculumTopic: "Network Layer",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "What is a Subnet Mask?",
    duration: "15:32",
    durationMins: 15.53,
    description: "Network Part",
    prerequisites: "",
    skillTag: "Network Part",
    difficultyLevel: 2,
    learningOutcome: "Master the concepts of Network Layer and Network Engineering Fundamentals.",
    curriculumTopic: "Network Layer",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "IPv4 Classes",
    duration: "13:48",
    durationMins: 13.8,
    description: "IPv4 Classes",
    prerequisites: "",
    skillTag: "IPv4 Classes",
    difficultyLevel: 2,
    learningOutcome: "Master the concepts of Network Layer and Network Engineering Fundamentals.",
    curriculumTopic: "Network Layer",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "Reserved IPv4 Addresses",
    duration: "19:08",
    durationMins: 19.13,
    description: "reserved ipv4",
    prerequisites: "",
    skillTag: "reserved ipv4",
    difficultyLevel: 2,
    learningOutcome: "Master the concepts of Network Layer and Network Engineering Fundamentals.",
    curriculumTopic: "Network Layer",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "Default Gateway",
    duration: "17:27",
    durationMins: 17.45,
    description: "default gateway",
    prerequisites: "",
    skillTag: "default gateway",
    difficultyLevel: 2,
    learningOutcome: "Master the concepts of Network Layer and Network Engineering Fundamentals.",
    curriculumTopic: "Network Layer",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "Subnetting",
    duration: "25:02",
    durationMins: 25.03,
    description: "subnetting",
    prerequisites: "",
    skillTag: "subnetting",
    difficultyLevel: 4,
    learningOutcome: "Master the concepts of Network Layer and Network Engineering Fundamentals.",
    curriculumTopic: "Network Layer",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "DHCP",
    duration: "21:29",
    durationMins: 21.48,
    description: "dhcp",
    prerequisites: "",
    skillTag: "dhcp",
    difficultyLevel: 3,
    learningOutcome: "Master the concepts of Network Protocols and Network Engineering Fundamentals.",
    curriculumTopic: "Network Protocols",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "ICMP",
    duration: "15:00",
    durationMins: 15,
    description: "icmp",
    prerequisites: "",
    skillTag: "icmp",
    difficultyLevel: 2,
    learningOutcome: "Master the concepts of Network Protocols and Network Engineering Fundamentals.",
    curriculumTopic: "Network Protocols",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "DNS",
    duration: "12:02",
    durationMins: 12.03,
    description: "dns",
    prerequisites: "",
    skillTag: "dns",
    difficultyLevel: 3,
    learningOutcome: "Master the concepts of Network Protocols and Network Engineering Fundamentals.",
    curriculumTopic: "Network Protocols",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "ARP",
    duration: "22:32",
    durationMins: 22.53,
    description: "arp",
    prerequisites: "",
    skillTag: "arp",
    difficultyLevel: 3,
    learningOutcome: "Master the concepts of Network Protocols and Network Engineering Fundamentals.",
    curriculumTopic: "Network Protocols",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "NTP",
    duration: "12:03",
    durationMins: 12.05,
    description: "ntp",
    prerequisites: "",
    skillTag: "ntp",
    difficultyLevel: 3,
    learningOutcome: "Master the concepts of Network Protocols and Network Engineering Fundamentals.",
    curriculumTopic: "Network Protocols",
    subTrack: "Foundations"
  },
  {
    topic: "Network Foundations",
    lesson: "Network Engineering Fundamentals",
    asset_name: "Transport Layer Responsibilities",
    duration: "23:10",
    durationMins: 23.17,
    description: "transport layer",
    prerequisites: "",
    skillTag: "transport layer",
    difficultyLevel: 3,
    learningOutcome: "Master the concepts of Transport and Application Layer and Network Engineering Fundamentals.",
    curriculumTopic: "Transport and Application Layer",
    subTrack: "Foundations"
  }
];
