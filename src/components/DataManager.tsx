import React, { useState, useEffect } from 'react';
import { fetchTopics, saveTopicsList, triggerEmbeddingGeneration } from '../services/firebaseService';
import { Database, FileSpreadsheet, UploadCloud, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

export const DataManager: React.FC = () => {
  const [sheetUrl, setSheetUrl] = useState('');
  const [csvText, setCsvText] = useState('');
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [existingTopics, setExistingTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchExistingTopics();
  }, []);

  const fetchExistingTopics = async () => {
    try {
      const list = await fetchTopics();
      setExistingTopics(list);
    } catch (err) {
      console.error("Error fetching existing topics:", err);
    }
  };

  // Basic CSV/TSV Parser
  const parseCSV = (text: string, delimiter = '\t') => {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return [];

    let finalDelimiter = delimiter;
    if (text.includes('\t')) {
      finalDelimiter = '\t';
    } else if (text.includes(',')) {
      finalDelimiter = ',';
    }

    const headers = lines[0].split(finalDelimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
    const results: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      let cols: string[] = [];
      if (finalDelimiter === ',') {
        const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
        cols = matches.map(c => c.trim().replace(/^["']|["']$/g, ''));
      } else {
        cols = line.split(finalDelimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
      }

      if (cols.length < headers.length) continue;

      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = cols[index] || '';
      });

      // Mapping headers to course schema
      const mappedItem = {
        topic: obj['Topic'] || obj['topic'] || obj['TOPIC'] || '',
        lesson: obj['Lesson'] || obj['lesson'] || obj['LESSON'] || '',
        duration: obj['Duration'] || obj['duration'] || obj['DURATION'] || '15:00',
        description: obj['Description'] || obj['description'] || obj['DESCRIPTION'] || '',
        prerequisites: obj['Prerequisites'] || obj['prerequisites'] || obj['PREREQUISITES'] || '',
        skillTag: obj['Skill_Tag'] || obj['Skill Tag'] || obj['skill_tag'] || obj['skillTag'] || '',
        difficultyLevel: parseInt(obj['Difficulty_Level'] || obj['Difficulty Level'] || obj['difficulty_level'] || obj['difficultyLevel'] || '5', 10),
        learningOutcome: obj['Learning_Outcome'] || obj['Learning Outcome'] || obj['learning_outcome'] || obj['learningOutcome'] || '',
        durationMins: parseFloat(obj['DurationMins'] || obj['durationMins'] || '20')
      };

      if (mappedItem.topic || mappedItem.lesson) {
        results.push(mappedItem);
      }
    }

    return results;
  };

  const handleCsvTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setCsvText(text);
    if (text.trim()) {
      const parsed = parseCSV(text);
      setParsedData(parsed);
    } else {
      setParsedData([]);
    }
  };

  const handleFetchFromUrl = async () => {
    if (!sheetUrl.trim()) return;
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      let exportUrl = sheetUrl;
      if (sheetUrl.includes('/edit')) {
        exportUrl = sheetUrl.replace(/\/edit.*$/, '/export?format=csv');
      }

      const res = await fetch(exportUrl);
      if (!res.ok) throw new Error("Could not fetch CSV from Sheet URL. Make sure it is shared publicly.");
      const text = await res.text();
      setCsvText(text);
      const parsed = parseCSV(text, ',');
      setParsedData(parsed);
      setMessage({ type: 'success', text: `Successfully fetched and parsed ${parsed.length} items from Google Sheet.` });
    } catch (err: any) {
      console.error(err);
      setMessage({ 
        type: 'error', 
        text: `Error fetching Google Sheet: ${err.message}. If CORS prevents direct fetching, please copy-paste cells from your spreadsheet instead.` 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToFirestore = async () => {
    if (parsedData.length === 0) return;
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      await saveTopicsList(parsedData);
      setMessage({ 
        type: 'success', 
        text: `Successfully ingested ${parsedData.length} records into the 'topics' collection. Embeddings are being generated.` 
      });
      setParsedData([]);
      setCsvText('');
      fetchExistingTopics();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `Failed to save: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerEmbeddings = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await triggerEmbeddingGeneration();
      setMessage({ type: 'success', text: res.message || 'Embedding processing completed.' });
      fetchExistingTopics();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `Embedding processing error: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="data-manager-layout">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
        <Database className="text-secondary" />
        <h2>Data Catalog & Ingestion</h2>
      </div>

      {message.text && (
        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          border: `1px solid ${message.type === 'success' ? 'var(--break-border)' : 'var(--lunch-border)'}`,
          background: message.type === 'success' ? 'var(--break-bg)' : 'var(--lunch-bg)',
          color: message.type === 'success' ? 'var(--break-text)' : 'var(--lunch-text)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span style={{ fontSize: '0.85rem' }}>{message.text}</span>
        </div>
      )}

      {/* Option 1: URL fetch */}
      <div className="view-card" style={{ padding: '1.25rem', gap: '1rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
          <FileSpreadsheet size={18} className="text-secondary" />
          <span>Option 1: Connect via Google Sheet URL</span>
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Ensure your Google Sheet is shared with "Anyone with the link can view". The columns should be: 
          <strong> Topic, Lesson, Duration, Description, Prerequisites, Skill_Tag, Difficulty_Level, Learning_Outcome</strong>.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input 
            type="text" 
            className="auth-input" 
            style={{ flex: 1 }}
            placeholder="https://docs.google.com/spreadsheets/d/.../edit"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
          />
          <button 
            onClick={handleFetchFromUrl} 
            className="btn-action" 
            disabled={loading}
          >
            {loading ? 'Fetching...' : 'Fetch Sheet'}
          </button>
        </div>
      </div>

      {/* Option 2: Copy paste TSV */}
      <div className="view-card" style={{ padding: '1.25rem', gap: '1rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
          <UploadCloud size={18} className="text-secondary" />
          <span>Option 2: Copy-Paste TSV/CSV Cells</span>
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Copy the rows directly from Google Sheet (including the header row) and paste them below:
        </p>
        <textarea 
          className="data-textarea"
          placeholder="Topic&#9;Lesson&#9;Duration&#9;Description&#9;Prerequisites&#9;Skill_Tag&#9;Difficulty_Level&#9;Learning_Outcome&#10;Data Center&#9;L2LS Architecture&#9;15:20&#9;Overview of Layer 2...&#9;&#9;Networking&#9;4&#9;Understand architecture"
          value={csvText}
          onChange={handleCsvTextChange}
        />
      </div>

      {parsedData.length > 0 && (
        <div className="view-card" style={{ padding: '1.25rem', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1rem' }}>Data Preview ({parsedData.length} records ready)</h3>
            <button onClick={handleSaveToFirestore} className="btn-action btn-primary" disabled={loading}>
              <UploadCloud size={14} />
              <span>Ingest to Database ({parsedData.length} rows)</span>
            </button>
          </div>
          <div className="topics-table-container">
            <table className="topics-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Lesson</th>
                  <th>Duration</th>
                  <th>Difficulty</th>
                  <th>Skill Tag</th>
                  <th>Prereqs</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    <td>{row.topic}</td>
                    <td>{row.lesson}</td>
                    <td>{row.duration}</td>
                    <td>{row.difficultyLevel}/10</td>
                    <td>{row.skillTag}</td>
                    <td>{row.prerequisites || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedData.length > 10 && (
              <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Showing first 10 of {parsedData.length} rows...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Catalog status */}
      <div className="view-card" style={{ padding: '1.25rem', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem' }}>Database Inventory ({existingTopics.length} loaded topics)</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={fetchExistingTopics} className="btn-action">
              <RefreshCw size={12} />
              <span>Refresh</span>
            </button>
            <button onClick={handleTriggerEmbeddings} className="btn-action">
              <span>Trigger Embeddings</span>
            </button>
          </div>
        </div>
        <div className="topics-table-container">
          <table className="topics-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Lesson</th>
                <th>Duration</th>
                <th>Difficulty</th>
                <th>Embedding Status</th>
              </tr>
            </thead>
            <tbody>
              {existingTopics.map((topic, i) => (
                <tr key={i}>
                  <td>{topic.topic}</td>
                  <td>{topic.lesson}</td>
                  <td>{topic.duration}</td>
                  <td>{topic.difficultyLevel || '5'}/10</td>
                  <td>
                    {topic.embedding ? (
                      <span className="fit-badge ok">Active</span>
                    ) : (
                      <span className="fit-badge warn">Pending / Mocked</span>
                    )}
                  </td>
                </tr>
              ))}
              {existingTopics.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No topics loaded in database yet. Import some data above to populate the catalog.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
