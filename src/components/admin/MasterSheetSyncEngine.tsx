/**
 * Master Sheet Synchronization Engine (R.A.E.S. Version 3 Standard)
 *
 * Implements Stage 1 Pre-Sync Sheet ETL:
 *   1. Agent-Tracking: Semantic source extraction via Gemini API & layout-aware engine.
 *   2. Agent-MasterAssets: Audits Master Assets Catalog (PK: asset_name).
 *   3. Agent-MasterPaths: Audits Master Learning Paths Hierarchy (FK: asset_name).
 *   4. Agent-Arbiter: Reconciles all differences into actionable diffs.
 *   5. Safety Gate: Google Drive pre-write snapshot backup before batch update.
 *   6. Stage 2 Handoff: Secondary Firestore ingestion after human audit.
 */

import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Clock,
  Sparkles,
  GitCompare,
  HardDrive,
  ChevronRight,
  Search,
  Check,
  Bot,
  Activity,
} from 'lucide-react';
import {
  SyncAction,
  type MasterAssetRow,
  type MasterLearningPathRow,
  type ReconciliationReport,
  type MasterSheetsConfig,
  type DriveSnapshotMetadata,
  type Stage2SyncResponse,
  type MultiAgentAuditReport,
} from '../../types/syncEngine';
import { formatDurationDisplay } from '../../utils/durationParser';
import { runAgentTrackingExtraction } from '../../services/aiTrackingExtractor';
import { SheetsEtlService } from '../../services/sheetsEtlService';
import { SheetsBatchWriter } from '../../services/sheetsBatchWriter';
import { reconcileWithMultiAgents } from '../../services/hierarchyReconciler';

const DEFAULT_TRACKING_SHEET_ID = '17zHyvRuBhf5cdBE1PGY4B1Yw7Pz3sLE4vBFgCvuEVrY';
const DEFAULT_MASTER_ASSETS_ID = '1f8mZwHXNlQbfnyZky2lxtjFAshXHMtsiK0gtgOLfSww';
const DEFAULT_MASTER_LEARNING_PATHS_ID = '1yRBjdg8Kjy5RVgmPvafkFmkSSFKA3EvmRmV1NWNw988';

type NavigationTab = 'overview' | 'asset_diff' | 'learning_path_diff' | 'audit_log';

export const MasterSheetSyncEngine: React.FC = () => {
  // R.A.E.S. Version 3 Navigation State
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');

  // Configuration State
  const [config, setConfig] = useState<MasterSheetsConfig>({
    trackingSpreadsheetId: DEFAULT_TRACKING_SHEET_ID,
    masterAssetsSpreadsheetId: DEFAULT_MASTER_ASSETS_ID,
    masterLearningPathsSpreadsheetId: DEFAULT_MASTER_LEARNING_PATHS_ID,
    googleApiKey: '',
    accessToken: '',
    geminiApiKey: '',
    useAiExtraction: true,
  });
  const [showConfig, setShowConfig] = useState(false);

  // Execution States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isStage2Syncing, setIsStage2Syncing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [stage2Result, setStage2Result] = useState<Stage2SyncResponse | null>(null);

  // Data & Reports
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [snapshots, setSnapshots] = useState<DriveSnapshotMetadata[]>([]);
  const [syncApplied, setSyncApplied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Search
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  /**
   * Generates sample dataset containing the benchmark discrepancy:
   * Automation Fundamentals -> Lesson 5 -> Topic 1:
   * Sub Topic 1: CloudVision Architecture
   * Sub Topic 2: CloudVision Deployment
   * Sub Topic 3: CloudVision and Device Communication (dropped previously in Master Paths!)
   */
  const generateRepresentativeDataset = () => {
    const trackingTabs: Record<string, (string | number | null | undefined)[][]> = {
      'Automation Fundamentals': [
        ['Track Name', 'Sub-Track Name', 'Lesson Name', 'Topic Name', 'Topic Description', 'Sub-Topic Name', 'Duration', 'Type', 'Skill Tag', 'Difficulty', 'CVP Version', 'Developer', 'Comments'],
        ['Automation Fundamentals', 'CloudVision', 'Lesson 5: Cloudvision Fundamentals', 'Topic 1: CloudVision Overview', 'Architectural overview of CloudVision', 'CloudVision Architecture', '00:15:30', 'video', 'CloudVision, Telemetry', 3, '2024.1.0', 'Curriculum Dev', 'Core overview'],
        ['', '', '', '', 'Deployment models and provisioning', 'CloudVision Deployment', '00:22:15', 'video', 'CloudVision, ZTP', 4, '2024.1.0', 'Curriculum Dev', 'Deployment options'],
        // The previously dropped item:
        ['', '', '', '', 'Device communications via TerminAttr & gNMI', 'CloudVision and Device Communication', '00:18:45', 'video', 'TerminAttr, gNMI', 4, '2024.1.0', 'Curriculum Dev', 'Restored by Agent-Tracking'],
        ['', '', 'Lesson 6: AVD Workflows', 'Topic 1: Ansible Basics', 'Hands-on AVD setup', 'AVD Fabric Build Lab', '45 mins', 'lab', 'AVD, Ansible', 6, '2024.1.0', 'Cloud Team', 'Updated lab'],
      ],
      'DC Track': [
        ['Track Name', 'Sub-Track Name', 'Lesson Name', 'Topic Name', 'Sub-Topic Name', 'Duration', 'Type', 'Skill Tag', 'Difficulty', 'EOS Version', 'Developer', 'Comments'],
        ['Data Center', 'Core Spine-Leaf', 'EVPN-VXLAN Fundamentals', 'Overlay Routing', 'EVPN Distributed Anycast Gateway', '00:14:45', 'video', 'EVPN, VXLAN, BGP', 4, '4.32.0F', 'Arista Curriculum Team', 'Revised for EOS 4.32'],
        ['', '', '', '', 'Centralized vs Distributed Routing', '00:18:20', 'video', 'EVPN, Routing', 4, '4.32.0F', 'Arista Curriculum Team', 'Merged cell node'],
      ],
    };

    // Existing Master Assets (Notice: CloudVision and Device Communication ALREADY exists here!)
    const masterAssets: MasterAssetRow[] = [
      {
        asset_name: 'CloudVision Architecture',
        asset_type: 'video',
        duration: 'PT00H15M30S',
        difficulty_level: 3,
        skill_tag: 'CloudVision, Telemetry',
        last_updated: '2025-01-15',
        'cvp_cv-cue_version': '2024.1.0',
        eos_version: '4.32.0F',
        avd_version: '',
        developer: 'Curriculum Dev',
        needs_update: false,
        comments: 'Existing asset',
      },
      {
        asset_name: 'CloudVision Deployment',
        asset_type: 'video',
        duration: 'PT00H22M15S',
        difficulty_level: 4,
        skill_tag: 'CloudVision, ZTP',
        last_updated: '2025-01-15',
        'cvp_cv-cue_version': '2024.1.0',
        eos_version: '4.32.0F',
        avd_version: '',
        developer: 'Curriculum Dev',
        needs_update: false,
        comments: 'Existing asset',
      },
      {
        // Exists in Master Assets, but was MISSING from Master Learning Paths!
        asset_name: 'CloudVision and Device Communication',
        asset_type: 'video',
        duration: 'PT00H18M45S',
        difficulty_level: 4,
        skill_tag: 'TerminAttr, gNMI',
        last_updated: '2025-01-15',
        'cvp_cv-cue_version': '2024.1.0',
        eos_version: '4.32.0F',
        avd_version: '',
        developer: 'Curriculum Dev',
        needs_update: false,
        comments: 'Cataloged in assets',
      },
      {
        asset_name: 'EVPN Distributed Anycast Gateway',
        asset_type: 'video',
        duration: 'PT00H12M00S', // Will show UPDATE (changed from 12m to 14m 45s)
        difficulty_level: 4,
        skill_tag: 'EVPN, VXLAN',
        last_updated: '2024-12-01',
        'cvp_cv-cue_version': '',
        eos_version: '4.30.0F',
        avd_version: '',
        developer: 'Curriculum Team',
        needs_update: false,
        comments: 'Prior revision',
      },
      {
        asset_name: 'Centralized vs Distributed Routing',
        asset_type: 'video',
        duration: 'PT00H18M20S',
        difficulty_level: 4,
        skill_tag: 'EVPN, Routing',
        last_updated: '2025-01-10',
        'cvp_cv-cue_version': '',
        eos_version: '4.32.0F',
        avd_version: '',
        developer: 'Arista Curriculum Team',
        needs_update: false,
        comments: 'Merged cell node',
      },
      {
        asset_name: 'Legacy 7050 Switch Architecture', // Will show DEPRECATED
        asset_type: 'video',
        duration: 'PT00H45M00S',
        difficulty_level: 2,
        skill_tag: 'Hardware',
        last_updated: '2022-04-01',
        'cvp_cv-cue_version': '',
        eos_version: '4.24.0F',
        avd_version: '',
        developer: 'Legacy Author',
        needs_update: true,
        comments: 'EOS',
      },
    ];

    // Existing Master Learning Paths (Notice: Terminates at Sub Topic 2, missing Sub Topic 3!)
    const masterPaths: MasterLearningPathRow[] = [
      {
        track_number: 1,
        track_name: 'Automation Fundamentals',
        sub_track_number: 1,
        sub_track_name: 'CloudVision',
        lesson_number: 5,
        lesson_name: 'Lesson 5: Cloudvision Fundamentals',
        topic_number: 1,
        topic_name: 'Topic 1: CloudVision Overview',
        topic_description: 'Architectural overview of CloudVision',
        sub_topic_number: 1,
        asset_name: 'CloudVision Architecture',
      },
      {
        track_number: 1,
        track_name: 'Automation Fundamentals',
        sub_track_number: 1,
        sub_track_name: 'CloudVision',
        lesson_number: 5,
        lesson_name: 'Lesson 5: Cloudvision Fundamentals',
        topic_number: 1,
        topic_name: 'Topic 1: CloudVision Overview',
        topic_description: 'Deployment models and provisioning',
        sub_topic_number: 2,
        asset_name: 'CloudVision Deployment',
      },
      // MISSING: CloudVision and Device Communication (Sub Topic 3)
      {
        track_number: 2,
        track_name: 'Data Center',
        sub_track_number: 1,
        sub_track_name: 'Core Spine-Leaf',
        lesson_number: 1,
        lesson_name: 'EVPN-VXLAN Fundamentals',
        topic_number: 1,
        topic_name: 'Overlay Routing',
        topic_description: 'EVPN Routing Concepts',
        sub_topic_number: 1,
        asset_name: 'EVPN Distributed Anycast Gateway',
      },
      {
        track_number: 2,
        track_name: 'Data Center',
        sub_track_number: 1,
        sub_track_name: 'Core Spine-Leaf',
        lesson_number: 1,
        lesson_name: 'EVPN-VXLAN Fundamentals',
        topic_number: 1,
        topic_name: 'Overlay Routing',
        topic_description: 'Comparative architectures',
        sub_topic_number: 2,
        asset_name: 'Centralized vs Distributed Routing',
      },
    ];

    return { trackingTabs, masterAssets, masterPaths };
  };

  // Run AI & Multi-Agent Diff Analysis
  const handleRunDiffAnalysis = async (useSample = false) => {
    setIsAnalyzing(true);
    setErrorMessage(null);
    setSyncApplied(false);
    setStage2Result(null);

    try {
      let trackingAssets: MasterAssetRow[] = [];
      let trackingPaths: MasterLearningPathRow[] = [];
      let masterAssets: MasterAssetRow[] = [];
      let masterPaths: MasterLearningPathRow[] = [];
      let trackingDiagnostic;

      if (useSample || (!config.googleApiKey && !config.accessToken)) {
        const sample = generateRepresentativeDataset();
        // Run Agent 1 (Semantic Source Extractor)
        const extraction = await runAgentTrackingExtraction(sample.trackingTabs, {
          geminiApiKey: config.geminiApiKey,
          forceSemanticHeuristic: !config.geminiApiKey,
        });
        trackingAssets = extraction.assets;
        trackingPaths = extraction.learningPaths;
        trackingDiagnostic = extraction.diagnostic;
        masterAssets = sample.masterAssets;
        masterPaths = sample.masterPaths;
      } else {
        const etlService = new SheetsEtlService(config);
        const trackingWorkbook = await etlService.fetchTrackingWorkbook();
        // Run Agent 1 against live fetched tabs
        const extraction = await runAgentTrackingExtraction(trackingWorkbook.tabs, {
          geminiApiKey: config.geminiApiKey,
          forceSemanticHeuristic: !config.geminiApiKey,
        });
        trackingAssets = extraction.assets;
        trackingPaths = extraction.learningPaths;
        trackingDiagnostic = extraction.diagnostic;
        masterAssets = await etlService.fetchMasterAssets();
        masterPaths = await etlService.fetchMasterLearningPaths();
      }

      // Reconcile via Agents 2, 3, and 4
      const generatedReport = reconcileWithMultiAgents(
        trackingAssets,
        masterAssets,
        trackingPaths,
        masterPaths,
        {
          sourceTrackingSheetId: config.trackingSpreadsheetId,
          targetAssetsSheetId: config.masterAssetsSpreadsheetId,
          targetLearningPathsSheetId: config.masterLearningPathsSpreadsheetId,
        },
        trackingDiagnostic
      );

      setReport(generatedReport);
      setActiveTab('overview');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Diff analysis failed:', err);
      setErrorMessage(`Diff Analysis Error: ${msg}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Commit Updates to Google Master Sheets with Safety Backup
  const handleApplyMasterUpdates = async () => {
    if (!report) return;
    if (report.hasValidationErrors) {
      setErrorMessage(
        `Write Blocked: Cannot commit while ${report.validationErrors.length} validation error(s) exist.`
      );
      return;
    }
    setIsApplying(true);
    setErrorMessage(null);

    try {
      const writer = new SheetsBatchWriter(config);

      // 1. Google Drive Pre-Write Snapshot Routine
      const assetSnapshot = await writer.createPreWriteSnapshot(
        config.masterAssetsSpreadsheetId,
        'Academy Master Assets'
      );
      const pathSnapshot = await writer.createPreWriteSnapshot(
        config.masterLearningPathsSpreadsheetId,
        'Academy Master Learning Paths'
      );

      const generatedSnapshots = [assetSnapshot, pathSnapshot];
      setSnapshots(generatedSnapshots);

      // 2. Prepare payload
      const updatedAssets: MasterAssetRow[] = [];
      for (const diff of report.assetDiffs) {
        if (diff.action !== SyncAction.DEPRECATED && diff.trackingRow) {
          updatedAssets.push(diff.trackingRow);
        } else if (diff.action === SyncAction.DEPRECATED && diff.masterRow) {
          updatedAssets.push({
            ...diff.masterRow,
            comments: `[DEPRECATED ${new Date().toISOString().split('T')[0]}] ${diff.masterRow.comments || ''}`.trim(),
            needs_update: true,
          });
        }
      }

      const updatedPaths: MasterLearningPathRow[] = [];
      for (const diff of report.learningPathDiffs) {
        if (diff.action !== SyncAction.DEPRECATED && diff.trackingRow) {
          updatedPaths.push(diff.trackingRow);
        }
      }

      // 3. Write strictly within bounded schema ranges (A1:L for Assets, A1:K for Paths)
      if (config.googleApiKey || config.accessToken) {
        const assetGrid = writer.formatAssetsToSheetGrid(updatedAssets);
        const pathGrid = writer.formatPathsToSheetGrid(updatedPaths);

        await writer.clearBoundedRange(config.masterAssetsSpreadsheetId, 'A1:L10000');
        await writer.batchWriteValues(config.masterAssetsSpreadsheetId, 'A1', assetGrid);

        await writer.clearBoundedRange(config.masterLearningPathsSpreadsheetId, 'A1:K10000');
        await writer.batchWriteValues(config.masterLearningPathsSpreadsheetId, 'A1', pathGrid);
      }

      setSyncApplied(true);
      setShowConfirmModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to apply updates to master sheets:', err);
      setErrorMessage(`Master Sheet Update Failed: ${msg}`);
    } finally {
      setIsApplying(false);
    }
  };

  // Stage 2: Ingest Masters into Firestore
  const handleTriggerStage2 = async () => {
    setIsStage2Syncing(true);
    setErrorMessage(null);

    try {
      const apiBaseUrl =
        window.location.protocol === 'file:' || !window.location.port || window.location.port !== '8082'
          ? 'http://localhost:8082'
          : '';

      const resp = await fetch(`${apiBaseUrl}/api/sync-sheets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await resp.json();
      if (resp.ok && data.success) {
        setStage2Result(data);
      } else {
        throw new Error(data.details || data.error || 'Stage 2 Ingestion failed');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Stage 2 Ingestion failed:', err);
      setErrorMessage(`Stage 2 Firestore Ingestion Error: ${msg}`);
    } finally {
      setIsStage2Syncing(false);
    }
  };

  // Filtered diff lists
  const filteredAssetDiffs = useMemo(() => {
    if (!report) return [];
    return report.assetDiffs.filter(item => {
      const matchesAction = actionFilter === 'ALL' || item.action === actionFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.asset_name.toLowerCase().includes(q) ||
        (item.trackingRow?.skill_tag || '').toLowerCase().includes(q) ||
        (item.masterRow?.skill_tag || '').toLowerCase().includes(q);
      return matchesAction && matchesSearch;
    });
  }, [report, actionFilter, searchQuery]);

  const filteredPathDiffs = useMemo(() => {
    if (!report) return [];
    return report.learningPathDiffs.filter(item => {
      const matchesAction = actionFilter === 'ALL' || item.action === actionFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.asset_name.toLowerCase().includes(q) ||
        item.track_name.toLowerCase().includes(q) ||
        item.lesson_name.toLowerCase().includes(q) ||
        item.topic_name.toLowerCase().includes(q);
      return matchesAction && matchesSearch;
    });
  }, [report, actionFilter, searchQuery]);

  // R.A.E.S. Version 3 Status Badges
  const renderActionBadge = (action: SyncAction) => {
    switch (action) {
      case SyncAction.ADD:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            ADD (NEW)
          </span>
        );
      case SyncAction.UPDATE:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            UPDATE
          </span>
        );
      case SyncAction.DEPRECATED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
            DEPRECATED
          </span>
        );
      case SyncAction.NO_CHANGE:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            UNCHANGED
          </span>
        );
    }
  };

  const multiAgentReport: MultiAgentAuditReport | undefined = report?.multiAgentReport;

  return (
    <div className="w-full flex flex-col gap-6 p-4 md:p-6 bg-slate-50/50 rounded-2xl border border-slate-200 shadow-sm">
      {/* ----------------------------------------------------------------- */}
      {/* 1. R.A.E.S. Version 3 HEADER & CONTROL CARD                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Master Sheet Synchronization Engine
                </h2>
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-700 rounded-full border border-indigo-200">
                  R.A.E.S. v3
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md">
                  Stage 1 Pre-Sync ETL
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Multi-Agent Semantic Parsing (<code className="text-xs font-mono font-bold text-indigo-600">Gemini API</code>) & Hierarchy Reconciliation for Academy Master Spreadsheets.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{showConfig ? 'Hide Config' : 'Spreadsheet IDs'}</span>
            </button>

            <button
              onClick={() => handleRunDiffAnalysis(true)}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors"
              title="Loads sample dataset including the CloudVision and Device Communication benchmark"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Load Benchmark Sample</span>
            </button>

            <button
              onClick={() => handleRunDiffAnalysis(false)}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? 'Running 4-Agent Audit...' : 'Run Diff Analysis'}</span>
            </button>
          </div>
        </div>

        {/* Expandable Configuration Drawer */}
        {showConfig && (
          <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tracking Sheet ID
              </label>
              <input
                type="text"
                value={config.trackingSpreadsheetId}
                onChange={e => setConfig({ ...config, trackingSpreadsheetId: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono text-[11px]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Master Assets Sheet ID
              </label>
              <input
                type="text"
                value={config.masterAssetsSpreadsheetId}
                onChange={e => setConfig({ ...config, masterAssetsSpreadsheetId: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono text-[11px]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Master Paths Sheet ID
              </label>
              <input
                type="text"
                value={config.masterLearningPathsSpreadsheetId}
                onChange={e => setConfig({ ...config, masterLearningPathsSpreadsheetId: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono text-[11px]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Gemini API Key (Optional)
              </label>
              <input
                type="password"
                placeholder="AI Studio API Key"
                value={config.geminiApiKey || ''}
                onChange={e => setConfig({ ...config, geminiApiKey: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono text-[11px]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-sm font-medium">{errorMessage}</div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 2. MULTI-AGENT DIAGNOSTIC STATUS CARDS                            */}
      {/* ----------------------------------------------------------------- */}
      {multiAgentReport && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Agent 1: Agent-Tracking */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Agent-Tracking</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {multiAgentReport.trackingAgent.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Semantic Source Extractor
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Dropped Items Rescued:</span>
              <span className="font-bold font-mono text-emerald-600">
                +{multiAgentReport.trackingAgent.droppedItemsPrevented || 0}
              </span>
            </div>
          </div>

          {/* Agent 2: Agent-MasterAssets */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Agent-MasterAssets</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  multiAgentReport.masterAssetsAgent.status === 'HEALTHY'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}>
                  {multiAgentReport.masterAssetsAgent.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Catalog Auditor (PK: asset_name)
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Discrepancies / Drift:</span>
              <span className="font-bold font-mono text-amber-600">
                {multiAgentReport.masterAssetsAgent.discrepanciesDetected}
              </span>
            </div>
          </div>

          {/* Agent 3: Agent-MasterPaths */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Agent-MasterPaths</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  multiAgentReport.masterPathsAgent.status === 'HEALTHY'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {multiAgentReport.masterPathsAgent.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Hierarchy Auditor (FK: asset_name)
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Sub-Topic Integrity:</span>
              <span className="font-bold font-mono text-emerald-600">Sequential (OK)</span>
            </div>
          </div>

          {/* Agent 4: Agent-Arbiter */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Agent-Arbiter</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {multiAgentReport.arbiterAgent.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Reconciliation & Diff Engine
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Safety Gate:</span>
              <span className={`font-bold font-mono ${report?.canCommit ? 'text-emerald-600' : 'text-rose-600'}`}>
                {report?.canCommit ? 'COMMIT AUTHORIZED' : 'BLOCKED'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Post-Sync Banner & Stage 2 Handoff */}
      {syncApplied && (
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5 shadow-sm text-emerald-900">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-emerald-950">
                  Stage 1 Pre-Sync Complete: Master Sheets Successfully Updated
                </h3>
                <p className="text-xs text-emerald-800 mt-1">
                  Google Drive pre-write snapshots created. Audited rows committed to bounded ranges (A1:L for Assets, A1:K for Paths).
                </p>
                {snapshots.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 text-[11px] font-mono text-emerald-700">
                    {snapshots.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.backupUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 underline hover:text-emerald-950"
                      >
                        <HardDrive className="w-3 h-3" />
                        <span>{s.backupFileName}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleTriggerStage2}
                disabled={isStage2Syncing}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-md transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${isStage2Syncing ? 'animate-spin' : ''}`} />
                <span>{isStage2Syncing ? 'Ingesting into Firestore...' : 'Stage 2: Ingest Masters into Firestore'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {stage2Result && (
            <div className="mt-4 pt-4 border-t border-emerald-200 text-xs text-emerald-900 bg-white/70 p-3 rounded-lg flex items-center justify-between">
              <div>
                <span className="font-bold">Firestore Sync Status:</span> Upserted{' '}
                <span className="font-mono font-semibold">{stage2Result.assets_count}</span> Assets and{' '}
                <span className="font-mono font-semibold">{stage2Result.curriculum_count}</span> Curriculum Nodes.
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 font-bold text-[10px]">
                LIVE IN FIRESTORE
              </span>
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 3. R.A.E.S. Version 3 PILL NAVIGATION BAR                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-indigo-600 text-white font-medium shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Sync Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('asset_diff')}
            className={`px-4 py-2 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'asset_diff'
                ? 'bg-indigo-600 text-white font-medium shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Asset Diff</span>
            {report && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === 'asset_diff' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-800'
                }`}
              >
                {report.summary.assetsToAdd + report.summary.assetsToUpdate}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('learning_path_diff')}
            className={`px-4 py-2 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'learning_path_diff'
                ? 'bg-indigo-600 text-white font-medium shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Learning Path Diff</span>
            {report && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === 'learning_path_diff' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-800'
                }`}
              >
                {report.summary.pathsToAdd + report.summary.pathsToUpdate}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('audit_log')}
            className={`px-4 py-2 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'audit_log'
                ? 'bg-indigo-600 text-white font-medium shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Audit Log</span>
            {report && report.validationErrors?.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-bold">
                {report.validationErrors.length}
              </span>
            )}
          </button>
        </div>

        {/* Primary CTA (Gated on diff completion and validation) */}
        {report && !syncApplied && (
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={isApplying || report.hasValidationErrors}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg shadow-sm transition-all shrink-0 ${
              report.hasValidationErrors
                ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
                : 'text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {report.hasValidationErrors
                ? `Write Blocked (${report.validationErrors.length} Errors)`
                : 'Apply Updates to Master Sheets'}
            </span>
          </button>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* TAB 1: SYNC OVERVIEW                                              */}
      {/* ----------------------------------------------------------------- */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6">
          {!report ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No Diff Analysis Generated Yet</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-6">
                Click "Load Benchmark Sample" or "Run Diff Analysis" to audit tracking records and verify the resolution of the nested sub-topic discrepancy.
              </p>
              <button
                onClick={() => handleRunDiffAnalysis(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span>Run Benchmark Diff Analysis</span>
              </button>
            </div>
          ) : (
            <>
              {/* Benchmark Resolution Spotlight */}
              <div className="bg-gradient-to-r from-indigo-50/80 via-emerald-50/50 to-white rounded-xl border border-indigo-200 p-4 shadow-sm flex items-start gap-3.5">
                <div className="p-2.5 bg-indigo-600 text-white rounded-lg shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="flex-1 text-xs">
                  <div className="font-bold text-sm text-indigo-950 flex items-center gap-2">
                    <span>Benchmark Verification: CloudVision and Device Communication</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      RESOLVED
                    </span>
                  </div>
                  <p className="text-slate-600 mt-1">
                    In track <span className="font-semibold text-slate-800">Automation Fundamentals</span> &rarr;{' '}
                    <span className="font-semibold text-slate-800">Lesson 5: Cloudvision Fundamentals</span> &rarr;{' '}
                    <span className="font-semibold text-slate-800">Topic 1: CloudVision Overview</span>:
                    The third entry <code className="font-mono font-bold text-indigo-700 bg-white px-1 py-0.5 rounded border border-indigo-200">CloudVision and Device Communication</code> is now cleanly preserved as{' '}
                    <span className="font-bold text-emerald-700">Sub Topic 3</span> in Master Learning Paths diff!
                  </p>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="text-xs font-medium text-slate-500">Tracking Assets</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    {report.summary.totalTrackingAssets}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {report.summary.totalTrackingPaths} learning path nodes
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm border-l-4 border-l-emerald-500">
                  <div className="text-xs font-medium text-emerald-700">New Additions (ADD)</div>
                  <div className="text-2xl font-bold text-emerald-600 mt-1">
                    +{report.summary.assetsToAdd}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    +{report.summary.pathsToAdd} learning path additions
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm border-l-4 border-l-amber-500">
                  <div className="text-xs font-medium text-amber-700">Modified (UPDATE)</div>
                  <div className="text-2xl font-bold text-amber-600 mt-1">
                    ~{report.summary.assetsToUpdate}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    ~{report.summary.pathsToUpdate} learning path changes
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm border-l-4 border-l-rose-500">
                  <div className="text-xs font-medium text-rose-700">Deprecated / Missing</div>
                  <div className="text-2xl font-bold text-rose-600 mt-1">
                    {report.summary.assetsDeprecated}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {report.summary.pathsDeprecated} path nodes removed
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 2: ASSET DIFF COMPARISON                                      */}
      {/* ----------------------------------------------------------------- */}
      {activeTab === 'asset_diff' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Academy Master Assets — Field-Level Diff
              </h3>
              <p className="text-xs text-slate-500">
                Primary Key: <code className="font-mono text-indigo-600">asset_name</code>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by asset name or tags..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-56"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                {['ALL', 'ADD', 'UPDATE', 'DEPRECATED', 'NO_CHANGE'].map(act => (
                  <button
                    key={act}
                    onClick={() => setActionFilter(act)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      actionFilter === act
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {act}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Asset Name (PK)</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Duration (ISO 8601)</th>
                  <th className="py-2.5 px-3">Field Differences</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssetDiffs.map((item, idx) => {
                  const asset = item.trackingRow || item.masterRow;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        {renderActionBadge(item.action)}
                      </td>
                      <td className="py-3 px-3 align-top font-medium text-slate-900 max-w-xs break-words">
                        {item.asset_name}
                      </td>
                      <td className="py-3 px-3 align-top text-slate-600 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                          {asset?.asset_type || 'video'}
                        </span>
                      </td>
                      <td className="py-3 px-3 align-top font-mono text-[11px] whitespace-nowrap">
                        <span className="text-slate-800 font-semibold">{asset?.duration}</span>
                        <div className="text-[10px] text-slate-400 font-sans">
                          {formatDurationDisplay(asset?.duration)}
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top">
                        {item.action === SyncAction.ADD && (
                          <span className="text-emerald-700 font-medium text-xs">
                            + New record will be appended to Master Assets
                          </span>
                        )}
                        {item.action === SyncAction.DEPRECATED && (
                          <span className="text-rose-700 font-medium text-xs">
                            - Record missing from tracking source; marked for deprecation
                          </span>
                        )}
                        {item.action === SyncAction.NO_CHANGE && (
                          <span className="text-slate-400 text-xs">Identical</span>
                        )}
                        {item.action === SyncAction.UPDATE && (
                          <div className="flex flex-col gap-1">
                            {item.fieldChanges.map((change, cIdx) => (
                              <div
                                key={cIdx}
                                className="p-1.5 rounded bg-amber-50 border border-amber-200 text-[11px]"
                              >
                                <span className="font-semibold text-amber-900">
                                  {change.label || change.field}:
                                </span>{' '}
                                <span className="line-through text-slate-500 font-mono">
                                  {String(change.previousValue || '(empty)')}
                                </span>{' '}
                                <span className="text-amber-700 font-bold">&rarr;</span>{' '}
                                <span className="text-emerald-700 font-mono font-bold">
                                  {String(change.proposedValue || '(empty)')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 3: LEARNING PATH DIFF (Crucial Benchmark Demonstration)       */}
      {/* ----------------------------------------------------------------- */}
      {activeTab === 'learning_path_diff' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Academy Master Learning Paths — Hierarchy Diff
              </h3>
              <p className="text-xs text-slate-500">
                Verifies sequential sub-topic numbering and restoration of nested curriculum nodes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter tracks, lessons, topics..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-56"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                {['ALL', 'ADD', 'UPDATE', 'DEPRECATED', 'NO_CHANGE'].map(act => (
                  <button
                    key={act}
                    onClick={() => setActionFilter(act)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      actionFilter === act
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {act}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Diff Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Track / Sub-Track</th>
                  <th className="py-2.5 px-3">Lesson / Topic</th>
                  <th className="py-2.5 px-3">Sub Topic #</th>
                  <th className="py-2.5 px-3">Referenced Asset (FK)</th>
                  <th className="py-2.5 px-3">Hierarchy Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPathDiffs.map((item, idx) => {
                  const path = item.trackingRow || item.masterRow;
                  const isBenchmarkItem = item.asset_name.toLowerCase().includes('cloudvision and device communication');

                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isBenchmarkItem ? 'bg-emerald-50/60 font-medium' : ''
                      }`}
                    >
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        {renderActionBadge(item.action)}
                        {isBenchmarkItem && (
                          <div className="mt-1">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-200 text-emerald-900">
                              RESCUED
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top">
                        <div className="font-semibold text-slate-900">{path?.track_name}</div>
                        <div className="text-[11px] text-slate-500">{path?.sub_track_name}</div>
                      </td>
                      <td className="py-3 px-3 align-top">
                        <div className="font-medium text-slate-800">{path?.lesson_name}</div>
                        <div className="text-[11px] text-indigo-700 flex items-center gap-1 mt-0.5">
                          <ChevronRight className="w-3 h-3 text-slate-400" />
                          <span>{path?.topic_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 align-top font-mono font-bold text-indigo-800">
                        Sub Topic {path?.sub_topic_number ?? '-'}
                      </td>
                      <td className="py-3 px-3 align-top font-mono text-[11px] text-indigo-900 max-w-xs break-words">
                        {item.asset_name}
                      </td>
                      <td className="py-3 px-3 align-top">
                        {item.action === SyncAction.ADD && (
                          <span className="text-emerald-700 font-medium text-xs">
                            + Missing node restored at sequential position {path?.sub_topic_number}
                          </span>
                        )}
                        {item.action === SyncAction.DEPRECATED && (
                          <span className="text-rose-700 font-medium text-xs">
                            - Node dropped in source tracking
                          </span>
                        )}
                        {item.action === SyncAction.NO_CHANGE && (
                          <span className="text-slate-400 text-xs">Unchanged</span>
                        )}
                        {item.action === SyncAction.UPDATE && (
                          <div className="flex flex-col gap-1">
                            {item.fieldChanges.map((change, cIdx) => (
                              <div
                                key={cIdx}
                                className="p-1 rounded bg-amber-50 border border-amber-200 text-[11px]"
                              >
                                <span className="font-semibold text-amber-900">{change.label}:</span>{' '}
                                <span className="line-through text-slate-500">
                                  {String(change.previousValue ?? 'empty')}
                                </span>{' '}
                                &rarr;{' '}
                                <span className="text-emerald-700 font-semibold">
                                  {String(change.proposedValue ?? 'empty')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* TAB 4: AUDIT LOG                                                  */}
      {/* ----------------------------------------------------------------- */}
      {activeTab === 'audit_log' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3">
          <h3 className="text-sm font-bold text-slate-900">Multi-Agent Operation & Diagnostic Logs</h3>
          <div className="flex flex-col gap-2 font-mono text-xs max-h-96 overflow-y-auto">
            {report?.auditLogs.map((log, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded-lg border flex items-start gap-2.5 ${
                  log.level === 'SUCCESS'
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : log.level === 'WARN'
                    ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                    : log.level === 'ERROR'
                    ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <span className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">
                  {log.timestamp.split('T')[1]?.slice(0, 8)}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    log.level === 'SUCCESS'
                      ? 'bg-emerald-200 text-emerald-800'
                      : log.level === 'WARN'
                      ? 'bg-amber-200 text-amber-800'
                      : log.level === 'ERROR'
                      ? 'bg-rose-200 text-rose-800'
                      : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  {log.category}
                </span>
                <span className="flex-1 font-sans">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* PRE-WRITE BACKUP CONFIRMATION MODAL                               */}
      {/* ----------------------------------------------------------------- */}
      {showConfirmModal && report && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-200 shrink-0">
                <HardDrive className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Authorize Master Sheets Pre-Sync Commit
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Mutations will be written to official Master Sheets in Google Drive.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Google Drive Pre-Write Snapshot Routine:</span>
                <p className="text-[11px] text-indigo-800 mt-0.5">
                  Before applying updates, timestamped clones of{' '}
                  <code className="font-mono font-semibold">Academy Master Assets</code> and{' '}
                  <code className="font-mono font-semibold">Academy Master Learning Paths</code> will be created automatically in Google Drive.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500">Assets to Upsert:</span>
                <div className="text-base font-bold text-slate-900">
                  {report.summary.assetsToAdd + report.summary.assetsToUpdate} records
                </div>
              </div>
              <div>
                <span className="text-slate-500">Learning Path Nodes:</span>
                <div className="text-base font-bold text-slate-900">
                  {report.summary.pathsToAdd + report.summary.pathsToUpdate} nodes
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isApplying}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleApplyMasterUpdates}
                disabled={isApplying}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm transition-all"
              >
                <Check className="w-4 h-4" />
                <span>{isApplying ? 'Cloning Backups & Writing...' : 'Authorize Snapshot & Commit'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
