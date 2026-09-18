/**
 * Master Sheet Synchronization Engine (Spreadsheet Pre-Sync Engine)
 * R.A.E.S. Version 3 Compatibility Layer
 *
 * Delegates directly to MasterSheetSyncEngine while maintaining backward
 * compatibility for existing consumers.
 */

import React from 'react';
import { MasterSheetSyncEngine } from './MasterSheetSyncEngine';

export { MasterSheetSyncEngine };
export const MasterSheetSyncModule: React.FC = () => {
  return <MasterSheetSyncEngine />;
};

export default MasterSheetSyncEngine;
