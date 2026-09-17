/**
 * Master Sheet Synchronization Engine (Spreadsheet Pre-Sync Engine)
 * AES Version 3 (AES v3) Administration & Audit Module
 *
 * Implements Stage 1 Pre-Sync Sheet ETL:
 *   1. Reads and extracts unstructured reference sheets (Academy Tracking).
 *   2. Reconciles records against intermediate Google Master Sheets.
 *   3. Performs Google Drive Pre-Write Safety Snapshots.
 *   4. Commits audited updates into Google Master Sheets.
 *   5. Hands off to Stage 2 (Firestore Ingestion).
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
} from 'lucide-react';
import {
  SyncAction,
  type MasterAssetRow,
  type MasterLearningPathRow,
  type ReconciliationReport,
  type MasterSheetsConfig,
  type DriveSnapshotMetadata,
} from '../../types/syncEngine';
import { formatDurationDisplay } from '../../utils/durationParser';
import { extractTrackingWorkbook } from '../../services/trackingParser';
import { SheetsEtlService } from '../../services/sheetsEtlService';
import { reconcileSheets } from '../../services/diffService';

/** Default Google Spreadsheet IDs */
const DEFAULT_TRACKING_SHEET_ID = '10oJp1jY5_Tracking_Source_AcademyTracking';
const DEFAULT_MASTER_ASSETS_ID = '1f8mZwHXNlQbfnyZky2lxtjFAshXHMtsiK0gtgOLfSww';
const DEFAULT_MASTER_LEARNING_PATHS_ID = '1yRBjdg8Kjy5RVgmPvafkFmkSSFKA3EvmRmV1NWNw988';

type NavigationTab = 'overview' | 'asset_diff' | 'learning_path_diff' | 'audit_log';

export const MasterSheetSyncModule: React.FC = () => {
  // Navigation
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');

  // Configuration
  const [config, setConfig] = useState<MasterSheetsConfig>({
    trackingSpreadsheetId: DEFAULT_TRACKING_SHEET_ID,
    masterAssetsSpreadsheetId: DEFAULT_MASTER_ASSETS_ID,
    masterLearningPathsSpreadsheetId: DEFAULT_MASTER_LEARNING_PATHS_ID,
    googleApiKey: '',
    accessToken: '',
  });
  const [showConfig, setShowConfig] = useState(false);

  // Execution States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isStage2Syncing, setIsStage2Syncing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [stage2Result, setStage2Result] = useState<any | null>(null);

  // Data & Reports
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [snapshots, setSnapshots] = useState<DriveSnapshotMetadata[]>([]);
  const [syncApplied, setSyncApplied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // -------------------------------------------------------------
  // REPRESENTATIVE DEMO DATA GENERATOR (Safe Sandbox / Verification)
  // -------------------------------------------------------------
  const generateSampleData = () => {
    // Tracking Sheet Multi-Tab Matrix
    const trackingTabs: Record<string, (string | number | null | undefined)[][]> = {
      'DC Track': [
        ['Track Name', 'Sub-Track Name', 'Lesson Name', 'Topic Name', 'Sub-Topic Name', 'Duration', 'Type', 'Skill Tag', 'Difficulty', 'EOS Version', 'Developer', 'Comments'],
        ['Data Center', 'Core Spine-Leaf', 'EVPN-VXLAN Fundamentals', 'Overlay Routing', 'EVPN Distributed Anycast Gateway', '00:14:45', 'video', 'EVPN, VXLAN, BGP', 4, '4.32.0F', 'Arista Curriculum Team', 'Revised for EOS 4.32'],
        ['', '', '', '', 'Centralized vs Distributed Routing', '00:18:20', 'video', 'EVPN, Routing', 4, '4.32.0F', 'Arista Curriculum Team', 'Merged cell test'],
        ['', '', 'Day-2 Operations', 'Telemetry & Observability', 'Streaming Telemetry with TerminAttr', '15 mins', 'lab', 'Telemetry, gNMI', 5, '4.32.0F', 'Arista Cloud Team', 'Hands-on lab updated'],
        ['', '', '', '', 'Flow Tracking with CloudVision', '00:12:10', 'video', 'CloudVision, Analytics', 3, '4.32.0F', 'Arista Cloud Team', 'New telemetry video'],
      ],
      'Campus Track': [
        ['Track Name', 'Sub-Track Name', 'Lesson Name', 'Topic Name', 'Asset Name', 'Duration', 'Type', 'Skill Tag', 'Difficulty', 'CVP Version', 'Developer', 'Needs Update'],
        ['Campus & Edge', 'Campus Architecture', 'PoE & Multi-Gigabit', 'Switching Fabric', 'Campus Core & Aggregation Overview', '01:20:00', 'video', 'Campus, PoE', 3, '2024.1.0', 'Campus Team', 'No'],
        ['', '', '', '', 'Arista Cognitive Campus Zero Touch', '25 min', 'video', 'ZTP, Campus', 4, '2024.1.0', 'Campus Team', 'Yes'],
      ],
      'AI Track': [
        ['Track Name', 'Lesson Name', 'Topic Name', 'Asset Name', 'Duration', 'Type', 'Skill Tag', 'Difficulty', 'AVD Version', 'Developer'],
        ['AI Networking', 'Ultra-Ethernet Architecture', 'RoCEv2 Transport', 'RoCEv2 Congestion Control & PFC', '00:22:40', 'video', 'RoCE, AI, PFC', 6, 'v4.2.0', 'AI Engineering'],
        ['', '', '', 'Lossless Fabric Buffer Sizing', '18:50', 'lab', 'Buffer Sizing, AI', 7, 'v4.2.0', 'AI Engineering'],
      ]
    };

    // Existing Master Assets (Target 1)
    const masterAssets: MasterAssetRow[] = [
      {
        asset_name: 'EVPN Distributed Anycast Gateway',
        asset_type: 'video',
        duration: 'PT00H12M00S', // Will be detected as MODIFIED (was 12m, tracking says 14m 45s)
        difficulty_level: 4,
        skill_tag: 'EVPN, VXLAN',
        last_updated: '2025-01-10',
        'cvp_cv-cue_version': '2023.2.0',
        eos_version: '4.30.0F',
        avd_version: '',
        developer: 'Curriculum Team',
        needs_update: false,
        comments: 'Original version',
      },
      {
        asset_name: 'Centralized vs Distributed Routing',
        asset_type: 'video',
        duration: 'PT00H18M20S', // UNCHANGED
        difficulty_level: 4,
        skill_tag: 'EVPN, Routing',
        last_updated: '2025-02-01',
        'cvp_cv-cue_version': '',
        eos_version: '4.32.0F',
        avd_version: '',
        developer: 'Arista Curriculum Team',
        needs_update: false,
        comments: 'Merged cell test',
      },
      {
        asset_name: 'Campus Core & Aggregation Overview',
        asset_type: 'video',
        duration: 'PT01H20M00S', // UNCHANGED
        difficulty_level: 3,
        skill_tag: 'Campus, PoE',
        last_updated: '2024-11-20',
        'cvp_cv-cue_version': '2024.1.0',
        eos_version: '',
        avd_version: '',
        developer: 'Campus Team',
        needs_update: false,
        comments: '',
      },
      {
        asset_name: 'Legacy 7050 Series Hardware Architecture', // Will be detected as DEPRECATED (missing in tracking)
        asset_type: 'video',
        duration: 'PT00H45M00S',
        difficulty_level: 2,
        skill_tag: 'Hardware',
        last_updated: '2022-05-15',
        'cvp_cv-cue_version': '',
        eos_version: '4.24.0F',
        avd_version: '',
        developer: 'Legacy Author',
        needs_update: true,
        comments: 'End of support candidate',
      }
    ];

    // Existing Master Learning Paths (Target 2)
    const masterPaths: MasterLearningPathRow[] = [
      {
        track_number: 1,
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
        track_number: 1,
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
      {
        track_number: 99,
        track_name: 'Legacy Hardware',
        sub_track_number: 1,
        sub_track_name: 'End of Life',
        lesson_number: 1,
        lesson_name: 'Archived Hardware',
        topic_number: 1,
        topic_name: '7050 Series',
        topic_description: 'Historical archives',
        sub_topic_number: 1,
        asset_name: 'Legacy 7050 Series Hardware Architecture', // Will be DEPRECATED
      }
    ];

    return { trackingTabs, masterAssets, masterPaths };
  };

  // -------------------------------------------------------------
  // STEP 1: RUN DIFF ANALYSIS
  // -------------------------------------------------------------
  const handleRunDiffAnalysis = async (useMock = false) => {
    setIsAnalyzing(true);
    setErrorMessage(null);
    setSyncApplied(false);
    setStage2Result(null);

    try {
      let trackingAssets: MasterAssetRow[] = [];
      let trackingPaths: MasterLearningPathRow[] = [];
      let masterAssets: MasterAssetRow[] = [];
      let masterPaths: MasterLearningPathRow[] = [];

      if (useMock || (!config.googleApiKey && !config.accessToken)) {
        // Run against representative multi-tab dataset
        const sample = generateSampleData();
        const extracted = extractTrackingWorkbook(sample.trackingTabs);
        trackingAssets = extracted.assets;
        trackingPaths = extracted.learningPaths;
        masterAssets = sample.masterAssets;
        masterPaths = sample.masterPaths;
      } else {
        // Live Google Sheets API fetch
        const etlService = new SheetsEtlService(config);
        const trackingData = await etlService.fetchTrackingWorkbook();
        const extracted = extractTrackingWorkbook(trackingData.tabs);
        trackingAssets = extracted.assets;
        trackingPaths = extracted.learningPaths;
        masterAssets = await etlService.fetchMasterAssets();
        masterPaths = await etlService.fetchMasterLearningPaths();
      }

      const generatedReport = reconcileSheets(
        trackingAssets,
        masterAssets,
        trackingPaths,
        masterPaths,
        {
          sourceTrackingSheetId: config.trackingSpreadsheetId,
          targetAssetsSheetId: config.masterAssetsSpreadsheetId,
          targetLearningPathsSheetId: config.masterLearningPathsSpreadsheetId,
        }
      );

      setReport(generatedReport);
      setActiveTab('overview');
    } catch (err: any) {
      console.error('Diff analysis failed:', err);
      setErrorMessage(`Diff Analysis Error: ${err.message || String(err)}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // -------------------------------------------------------------
  // STEP 3: APPLY MUTATIONS TO MASTER SHEETS (WITH DRIVE BACKUP)
  // -------------------------------------------------------------
  const handleApplyMasterUpdates = async () => {
    if (!report) return;
    setIsApplying(true);
    setErrorMessage(null);

    try {
      const etlService = new SheetsEtlService(config);

      // 1. Google Drive Pre-Write Snapshot Routine
      const assetSnapshot = await etlService.createDriveSnapshot(
        config.masterAssetsSpreadsheetId,
        'Academy Master Assets'
      );
      const pathSnapshot = await etlService.createDriveSnapshot(
        config.masterLearningPathsSpreadsheetId,
        'Academy Master Learning Paths'
      );

      const generatedSnapshots = [assetSnapshot, pathSnapshot];
      setSnapshots(generatedSnapshots);

      // 2. Prepare payload: active + updated assets from diff
      const updatedAssets: MasterAssetRow[] = [];
      for (const diff of report.assetDiffs) {
        if (diff.action !== SyncAction.DEPRECATED && diff.trackingRow) {
          updatedAssets.push(diff.trackingRow);
        } else if (diff.action === SyncAction.DEPRECATED && diff.masterRow) {
          // If retained as flagged deprecated
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

      // 3. Write to Google Sheets (or simulate in dry-run mode)
      if (config.googleApiKey || config.accessToken) {
        const assetValues = etlService.formatAssetsToSheetValues(updatedAssets);
        const pathValues = etlService.formatLearningPathsToSheetValues(updatedPaths);

        await etlService.clearSheetRange(config.masterAssetsSpreadsheetId, 'A1:Z10000');
        await etlService.writeSheetValues(config.masterAssetsSpreadsheetId, 'A1', assetValues);

        await etlService.clearSheetRange(config.masterLearningPathsSpreadsheetId, 'A1:Z10000');
        await etlService.writeSheetValues(config.masterLearningPathsSpreadsheetId, 'A1', pathValues);
      }

      setSyncApplied(true);
      setShowConfirmModal(false);
    } catch (err: any) {
      console.error('Failed to apply updates to master sheets:', err);
      setErrorMessage(`Master Sheet Update Failed: ${err.message || String(err)}`);
    } finally {
      setIsApplying(false);
    }
  };

  // -------------------------------------------------------------
  // STAGE 2 HANDOFF: TRIGGER FIRESTORE INGESTION
  // -------------------------------------------------------------
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
    } catch (err: any) {
      console.error('Stage 2 Ingestion failed:', err);
      setErrorMessage(`Stage 2 Firestore Ingestion Error: ${err.message}`);
    } finally {
      setIsStage2Syncing(false);
    }
  };

  // -------------------------------------------------------------
  // FILTERED DIFF LISTS
  // -------------------------------------------------------------
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

  // Helper for Action Badge Styling adhering to AES v3
  const renderActionBadge = (action: SyncAction) => {
    switch (action) {
      case SyncAction.ADD:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            NEW (ADD)
          </span>
        );
      case SyncAction.UPDATE:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            MODIFIED (UPDATE)
          </span>
        );
      case SyncAction.DEPRECATED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
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

  return (
    <div className="w-full flex flex-col gap-6 p-4 md:p-6 bg-slate-50/50 rounded-2xl border border-slate-200 shadow-sm">
      {/* ------------------------------------------------------------- */}
      {/* AES v3 HEADER & STAGE INDICATOR CARD                          */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <GitCompare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Master Sheet Synchronization Engine
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-700 rounded-md">
                  Stage 1 Pre-Sync ETL
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Audits and reconciles human-entered <span className="font-semibold text-slate-700">Academy Tracking</span> sheets against intermediate Google Master Sheets before Firestore ingestion.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{showConfig ? 'Hide Config' : 'Sheet Sources'}</span>
            </button>

            <button
              onClick={() => handleRunDiffAnalysis(true)}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors"
              title="Runs diff analysis against representative sample dataset"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Load Sample Data</span>
            </button>

            <button
              onClick={() => handleRunDiffAnalysis(false)}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? 'Analyzing Sheets...' : 'Run Diff Analysis'}</span>
            </button>
          </div>
        </div>

        {/* Expandable Configuration Drawer */}
        {showConfig && (
          <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Source: Academy Tracking (ID)
              </label>
              <input
                type="text"
                value={config.trackingSpreadsheetId}
                onChange={e => setConfig({ ...config, trackingSpreadsheetId: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-[11px]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Target 1: Academy Master Assets (ID)
              </label>
              <input
                type="text"
                value={config.masterAssetsSpreadsheetId}
                onChange={e => setConfig({ ...config, masterAssetsSpreadsheetId: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-[11px]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Target 2: Academy Master Learning Paths (ID)
              </label>
              <input
                type="text"
                value={config.masterLearningPathsSpreadsheetId}
                onChange={e => setConfig({ ...config, masterLearningPathsSpreadsheetId: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-[11px]"
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

      {/* ------------------------------------------------------------- */}
      {/* POST-SYNC SUCCESS BANNER & STAGE 2 HANDOFF                    */}
      {/* ------------------------------------------------------------- */}
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
                  Google Drive pre-write snapshots created. Audited rows have been committed to <span className="font-semibold">Academy Master Assets</span> and <span className="font-semibold">Academy Master Learning Paths</span>.
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

            {/* Stage 2 Trigger Action */}
            <div className="flex items-center gap-3">
              <a
                href={`https://docs.google.com/spreadsheets/d/${config.masterAssetsSpreadsheetId}/edit`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg shadow-sm transition-colors"
              >
                <span>Open Master Assets</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

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

      {/* ------------------------------------------------------------- */}
      {/* AES v3 PILL NAVIGATION BAR                                    */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Sync Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('asset_diff')}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'asset_diff'
                ? 'bg-indigo-600 text-white shadow-sm'
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
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'learning_path_diff'
                ? 'bg-indigo-600 text-white shadow-sm'
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
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              activeTab === 'audit_log'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Audit Log</span>
          </button>
        </div>

        {/* Global Action Trigger in Tab Bar */}
        {report && !syncApplied && (
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={isApplying}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition-all shrink-0"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Apply Updates to Master Sheets</span>
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: SYNC OVERVIEW                                          */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6">
          {!report ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                <GitCompare className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No Diff Analysis Generated Yet</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-6">
                Click "Run Diff Analysis" or "Load Sample Data" to audit tracking records, compare attributes, and prepare master sheet synchronization.
              </p>
              <button
                onClick={() => handleRunDiffAnalysis(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span>Run Analysis on Demo Dataset</span>
              </button>
            </div>
          ) : (
            <>
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="text-xs font-medium text-slate-500">Source Tracking Assets</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    {report.summary.totalTrackingAssets}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Extracted from reference sheets
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm border-l-4 border-l-emerald-500">
                  <div className="text-xs font-medium text-emerald-700">New Additions (ADD)</div>
                  <div className="text-2xl font-bold text-emerald-600 mt-1">
                    +{report.summary.assetsToAdd}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {report.summary.pathsToAdd} new learning path nodes
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm border-l-4 border-l-amber-500">
                  <div className="text-xs font-medium text-amber-700">Modified Records (UPDATE)</div>
                  <div className="text-2xl font-bold text-amber-600 mt-1">
                    ~{report.summary.assetsToUpdate}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {report.summary.pathsToUpdate} learning path adjustments
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm border-l-4 border-l-rose-500">
                  <div className="text-xs font-medium text-rose-700">Deprecated / Missing</div>
                  <div className="text-2xl font-bold text-rose-600 mt-1">
                    {report.summary.assetsDeprecated}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Removed from source tracking
                  </div>
                </div>
              </div>

              {/* Two-Stage Pipeline Flow Architecture Diagram Card */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>Decoupled Two-Stage Synchronization Architecture</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 relative">
                    <div className="font-bold text-slate-800 mb-1">Source Sheet</div>
                    <div className="text-slate-600 mb-2">Academy Tracking (Google Drive)</div>
                    <p className="text-[11px] text-slate-500">
                      Human-maintained multi-tab reference sheets containing track hierarchies, durations, and skill tags.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 relative">
                    <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
                      Stage 1 (Pre-Sync)
                    </span>
                    <div className="font-bold text-indigo-950 mb-1">Intermediate Master Sheets</div>
                    <div className="text-indigo-800 font-semibold mb-2">
                      Academy Master Assets & Learning Paths
                    </div>
                    <p className="text-[11px] text-indigo-900/80">
                      Strict schema normalization, ISO 8601 duration formatting, diff reconciliation, and Google Drive snapshot backups.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 relative">
                    <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                      Stage 2 (Ingestion)
                    </span>
                    <div className="font-bold text-emerald-950 mb-1">Cloud Firestore SSoT</div>
                    <div className="text-emerald-800 font-semibold mb-2">
                      `assets` & `curriculum_map` Collections
                    </div>
                    <p className="text-[11px] text-emerald-900/80">
                      Production database queried by downstream apps (Academy Timeliner, Academy Builder, Academy Insight).
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: ASSET DIFF COMPARISON TABLE                            */}
      {/* ------------------------------------------------------------- */}
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

            {/* Filter Pills & Search */}
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

          {/* Diff Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Asset Name (PK)</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Duration (ISO 8601)</th>
                  <th className="py-2.5 px-3">Versions (EOS / CVP)</th>
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
                      <td className="py-3 px-3 align-top text-slate-600 text-[11px]">
                        {asset?.eos_version && <div>EOS: {asset.eos_version}</div>}
                        {asset?.['cvp_cv-cue_version'] && (
                          <div>CVP: {asset['cvp_cv-cue_version']}</div>
                        )}
                        {!asset?.eos_version && !asset?.['cvp_cv-cue_version'] && (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top">
                        {item.action === SyncAction.ADD && (
                          <span className="text-emerald-700 font-medium text-xs">
                            + New record will be appended to Master Assets
                          </span>
                        )}
                        {item.action === SyncAction.DEPRECATED && (
                          <span className="text-rose-700 font-medium text-xs">
                            - Record missing from source tracking; flag for deprecation
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

                {filteredAssetDiffs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No assets match the selected criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: LEARNING PATH DIFF COMPARISON TABLE                    */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'learning_path_diff' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Academy Master Learning Paths — Curriculum Hierarchy Diff
              </h3>
              <p className="text-xs text-slate-500">
                Foreign Key: <code className="font-mono text-indigo-600">asset_name</code>
              </p>
            </div>

            {/* Filter Pills & Search */}
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

          {/* Learning Path Diff Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Track & Sub-Track</th>
                  <th className="py-2.5 px-3">Lesson & Topic</th>
                  <th className="py-2.5 px-3">Referenced Asset (FK)</th>
                  <th className="py-2.5 px-3">Hierarchy Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPathDiffs.map((item, idx) => {
                  const path = item.trackingRow || item.masterRow;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        {renderActionBadge(item.action)}
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
                      <td className="py-3 px-3 align-top font-mono text-[11px] text-indigo-900 max-w-xs break-words">
                        {item.asset_name}
                      </td>
                      <td className="py-3 px-3 align-top">
                        {item.action === SyncAction.ADD && (
                          <span className="text-emerald-700 font-medium text-xs">
                            + New curriculum node added to master learning paths
                          </span>
                        )}
                        {item.action === SyncAction.DEPRECATED && (
                          <span className="text-rose-700 font-medium text-xs">
                            - Node removed from source tracking hierarchy
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

                {filteredPathDiffs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No learning paths match the selected criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: AUDIT LOG                                              */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'audit_log' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3">
          <h3 className="text-sm font-bold text-slate-900">Pre-Sync Audit & Reconciliation Logs</h3>
          <div className="flex flex-col gap-2 font-mono text-xs">
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

            {!report && (
              <div className="text-center py-6 text-slate-400 font-sans">
                Run diff analysis to view operation logs.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* AES v3 BACKUP CONFIRMATION MODAL                              */}
      {/* ------------------------------------------------------------- */}
      {showConfirmModal && report && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-200 shrink-0">
                <HardDrive className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Confirm Master Sheets Pre-Sync
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  You are about to write audited mutations to official Google Master Sheets.
                </p>
              </div>
            </div>

            {/* Safety Backup Alert */}
            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Google Drive Pre-Write Snapshot Routine:</span>
                <p className="text-[11px] text-indigo-800 mt-0.5">
                  Before any rows are modified, timestamped backup copies of{' '}
                  <code className="font-mono font-semibold">Academy Master Assets</code> and{' '}
                  <code className="font-mono font-semibold">Academy Master Learning Paths</code> will be cloned to Google Drive automatically.
                </p>
              </div>
            </div>

            {/* Mutation Summary */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500">Assets to Update / Add:</span>
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
                <span>{isApplying ? 'Creating Backups & Writing...' : 'Authorize Snapshot & Commit'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
