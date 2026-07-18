import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Calendar, GripVertical, Clock, Layers, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import './TimelineCalendar.css';

// =============================================================================
// TYPES
// =============================================================================

/** A flat curriculum module from path.modules */
interface Module {
  topic?: string;
  subTrack?: string;
  lesson?: string;
  curriculumTopic?: string;
  asset_name?: string;
  duration?: string;
  durationMins?: number;
  difficultyLevel?: number;
  difficulty?: number;
  skillTag?: string;
  prerequisites?: string;
  sorting?: { lesson_number?: number; topic_number?: number; sub_topic_number?: number } | number;
}

/** Hierarchy levels for drag scoping */
type HierarchyLevel = 'lesson' | 'topic' | 'subtopic';

/** Composite ID for any hierarchy node */
type NodeId = string;

/** A leaf block on the calendar grid */
interface CalendarBlock {
  id: NodeId;
  lessonKey: string;
  topicKey: string;
  module: Module;
  dayIndex: number;  // 0-6 (Mon-Sun)
  sortOrder: number;
}

/** Drag payload — the object passed through the drag lifecycle */
interface DragData {
  rootId: NodeId;
  level: HierarchyLevel;
  childBlockIds: string[];
  originDayIndex: number;
}

/** Position state for drag ghost */
interface DragGhostState {
  visible: boolean;
  x: number;
  y: number;
  content: React.ReactNode | null;
}

// =============================================================================
// HIERARCHY RESOLVER
// Groups flat modules[] into Lesson → Topic → Sub-Topic tree
// =============================================================================

interface TopicGroup {
  topicKey: string;
  topicLabel: string;
  blocks: CalendarBlock[];
}

interface LessonGroup {
  lessonKey: string;
  lessonLabel: string;
  topics: TopicGroup[];
}

function buildHierarchy(modules: Module[]): { blocks: CalendarBlock[]; lessons: LessonGroup[] } {
  const blocks: CalendarBlock[] = [];
  const lessonMap = new Map<string, Map<string, CalendarBlock[]>>();

  modules.forEach((mod, idx) => {
    const lessonName = mod.lesson || 'General Lesson';
    const topicName = mod.curriculumTopic || mod.topic || 'General Topic';
    const assetName = mod.asset_name || `Asset ${idx + 1}`;

    const lessonKey = `lesson::${lessonName}`;
    const topicKey = `topic::${lessonName}::${topicName}`;
    const blockId = `subtopic::${lessonName}::${topicName}::${assetName}::${idx}`;

    // Compute sort order from sorting object
    let sortOrder = idx;
    if (mod.sorting && typeof mod.sorting === 'object') {
      const s = mod.sorting;
      sortOrder = ((s.lesson_number ?? 0) * 10000) + ((s.topic_number ?? 0) * 100) + (s.sub_topic_number ?? 0);
    }

    const block: CalendarBlock = {
      id: blockId,
      lessonKey,
      topicKey,
      module: mod,
      dayIndex: 0, // Will be assigned by distribution
      sortOrder,
    };

    blocks.push(block);

    if (!lessonMap.has(lessonKey)) {
      lessonMap.set(lessonKey, new Map());
    }
    const topicsInLesson = lessonMap.get(lessonKey)!;
    if (!topicsInLesson.has(topicKey)) {
      topicsInLesson.set(topicKey, []);
    }
    topicsInLesson.get(topicKey)!.push(block);
  });

  // Sort blocks within each topic by sort order
  lessonMap.forEach((topicsMap) => {
    topicsMap.forEach((blockList) => {
      blockList.sort((a, b) => a.sortOrder - b.sortOrder);
    });
  });

  // Distribute lessons across days (round-robin by topic groups for balance)
  let dayCounter = 0;
  const lessons: LessonGroup[] = [];

  lessonMap.forEach((topicsMap, lessonKey) => {
    const topics: TopicGroup[] = [];
    topicsMap.forEach((blockList, topicKey) => {
      // All blocks in a topic group start on the same day
      const assignedDay = dayCounter % 7;
      blockList.forEach(b => { b.dayIndex = assignedDay; });
      topics.push({
        topicKey,
        topicLabel: blockList[0]?.module.curriculumTopic || blockList[0]?.module.topic || 'Topic',
        blocks: blockList,
      });
      dayCounter++;
    });

    lessons.push({
      lessonKey,
      lessonLabel: topics[0]?.blocks[0]?.module.lesson || 'Lesson',
      topics,
    });
  });

  return { blocks, lessons };
}

// =============================================================================
// GRID REFLOW ENGINE (decoupled — can be called independently)
// =============================================================================

/**
 * Recalculates day assignments after a group drop.
 * Pure function: takes current blocks + move intent, returns new assignments.
 *
 * @param rootId        The composite ID of the moved group (lesson or topic level)
 * @param level         Which hierarchy level was dragged
 * @param targetDay     The destination day column index (0-6)
 * @param allBlocks     Current state of all calendar blocks
 * @returns             Updated blocks array with new dayIndex values
 */
function restack(
  rootId: NodeId,
  level: HierarchyLevel,
  targetDay: number,
  allBlocks: CalendarBlock[]
): CalendarBlock[] {
  // 1. Identify which blocks belong to the moved group
  const isChild = (block: CalendarBlock): boolean => {
    switch (level) {
      case 'lesson':
        return block.lessonKey === rootId;
      case 'topic':
        return block.topicKey === rootId;
      case 'subtopic':
        return block.id === rootId;
      default:
        return false;
    }
  };

  const movedBlocks = allBlocks.filter(isChild);
  const stationaryBlocks = allBlocks.filter(b => !isChild(b));

  // 2. Collision detection: target day grid reflow

  // 3. Assign all moved blocks to the target day (preserving their sort order)
  const updatedMoved = movedBlocks
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((block, _idx) => ({
      ...block,
      dayIndex: targetDay,
    }));

  // 4. Merge back: stationary blocks stay, moved blocks go to new position
  // Order within a day: existing first, then new arrivals (appended at bottom)
  const result = [...stationaryBlocks, ...updatedMoved];

  // 5. Verify no ID collisions (defensive)
  const seen = new Set<string>();
  result.forEach(b => {
    if (seen.has(b.id)) {
      console.warn(`[GridReflowEngine] Duplicate block ID detected: ${b.id}`);
    }
    seen.add(b.id);
  });

  return result;
}

// =============================================================================
// HELPER: Week date generation
// =============================================================================

function getWeekDates(weekOffset: number): Date[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + (weekOffset * 7));

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// =============================================================================
// COMPONENT: TimelineCalendar
// =============================================================================

interface TimelineCalendarProps {
  path: any;
  loading?: boolean;
}

export const TimelineCalendar: React.FC<TimelineCalendarProps> = ({ path, loading }) => {
  // ---- State ----
  const [weekOffset, setWeekOffset] = useState(0);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [dragData, setDragData] = useState<DragData | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [hoverState, setHoverState] = useState<{ id: NodeId; level: HierarchyLevel } | null>(null);
  const [ghostState, setGhostState] = useState<DragGhostState>({ visible: false, x: 0, y: 0, content: null });

  const calendarRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

  // ---- Derive hierarchy from path.modules ----
  const hierarchy = useMemo(() => {
    if (!path?.modules?.length) return null;
    return buildHierarchy(path.modules);
  }, [path]);

  // Initialize blocks from hierarchy
  useEffect(() => {
    if (hierarchy) {
      setBlocks(hierarchy.blocks);
    }
  }, [hierarchy]);

  // ---- Week dates ----
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  // ---- Group blocks by day for rendering ----
  const blocksByDay = useMemo(() => {
    const map = new Map<number, CalendarBlock[]>();
    for (let i = 0; i < 7; i++) map.set(i, []);
    blocks.forEach(b => {
      const dayBlocks = map.get(b.dayIndex) || [];
      dayBlocks.push(b);
      map.set(b.dayIndex, dayBlocks);
    });
    // Sort each day's blocks
    map.forEach((dayBlocks) => {
      dayBlocks.sort((a, b) => a.sortOrder - b.sortOrder);
    });
    return map;
  }, [blocks]);

  // ---- KPI calculations ----
  const totalBlocks = blocks.length;
  const uniqueTopics = new Set(blocks.map(b => b.topicKey)).size;
  const uniqueLessons = new Set(blocks.map(b => b.lessonKey)).size;

  // ===========================================================================
  // DRAG SCOPE MANAGER
  // Core fix: onDragStart locks root_id to the handle's hierarchy level
  // ===========================================================================

  /**
   * handleDragStart — The surgical fix for the hierarchy scoping bug.
   *
   * When a handle is clicked, this function:
   * 1. Calls stopPropagation() to prevent sub-components from hijacking
   * 2. Reads the handle's data-hierarchy-level to determine scope
   * 3. Collects ALL descendant block IDs under the group
   * 4. Sets dragData.rootId to the GROUP identifier (not the sub-topic)
   *
   * This ensures dragging a Topic handle moves all child Sub-Topics,
   * and dragging a Lesson handle moves all child Topics + Sub-Topics.
   */
  const handleDragStart = useCallback((
    e: React.MouseEvent,
    level: HierarchyLevel,
    groupId: NodeId,
    originDayIndex: number
  ) => {
    e.stopPropagation();
    e.preventDefault();

    // Collect all child block IDs based on hierarchy level
    let childBlockIds: string[];
    switch (level) {
      case 'lesson':
        childBlockIds = blocks.filter(b => b.lessonKey === groupId).map(b => b.id);
        break;
      case 'topic':
        childBlockIds = blocks.filter(b => b.topicKey === groupId).map(b => b.id);
        break;
      case 'subtopic':
        childBlockIds = [groupId];
        break;
      default:
        childBlockIds = [groupId];
    }

    const newDragData: DragData = {
      rootId: groupId,
      level,
      childBlockIds,
      originDayIndex,
    };

    setDragData(newDragData);

    // Create ghost content label
    const label = level === 'lesson'
      ? `📚 Lesson (${childBlockIds.length} items)`
      : level === 'topic'
        ? `📖 Topic (${childBlockIds.length} items)`
        : '📄 Sub-Topic';

    setGhostState({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      content: (
        <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--accent-color)', borderRadius: '8px', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>
          {label}
        </div>
      ),
    });
  }, [blocks]);

  // ---- Document-level mouse listeners for drag ----
  useEffect(() => {
    if (!dragData) return;

    const handleMouseMove = (e: MouseEvent) => {
      setGhostState(prev => ({
        ...prev,
        x: e.clientX,
        y: e.clientY,
      }));

      // Hit test: which day column is the cursor over?
      if (calendarRef.current) {
        const columns = calendarRef.current.querySelectorAll('.timeline-calendar__day-body');
        let foundDay: number | null = null;
        columns.forEach((col, idx) => {
          const rect = col.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            foundDay = idx;
          }
        });
        setDropTarget(foundDay);
      }
    };

    const handleMouseUp = () => {
      // Execute drop
      if (dragData && dropTarget !== null && dropTarget !== dragData.originDayIndex) {
        handleDrop(dragData.rootId, dragData.level, dropTarget);
      }
      // Clean up
      setDragData(null);
      setDropTarget(null);
      setGhostState({ visible: false, x: 0, y: 0, content: null });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragData, dropTarget]);

  // ===========================================================================
  // DROP HANDLER
  // Accepts root_id, triggers decoupled restack(), updates state
  // ===========================================================================

  const handleDrop = useCallback((rootId: NodeId, level: HierarchyLevel, targetDay: number) => {
    setBlocks(prevBlocks => {
      const newBlocks = restack(rootId, level, targetDay, prevBlocks);
      return newBlocks;
    });
  }, []);

  // ===========================================================================
  // HOVER STATE MANAGEMENT
  // Separate from drag — sets data-hover-level attributes for CSS highlighting
  // ===========================================================================

  const handleHoverEnter = useCallback((id: NodeId, level: HierarchyLevel) => {
    if (!dragData) { // Don't interfere during active drag
      setHoverState({ id, level });
    }
  }, [dragData]);

  const handleHoverLeave = useCallback(() => {
    if (!dragData) {
      setHoverState(null);
    }
  }, [dragData]);

  // ===========================================================================
  // RENDER HELPERS
  // ===========================================================================

  const renderBlock = (block: CalendarBlock) => {
    const mod = block.module;
    const isBeingDragged = dragData?.childBlockIds.includes(block.id) ?? false;
    const isHovered = hoverState?.id === block.id && hoverState?.level === 'subtopic';

    return (
      <div
        key={block.id}
        className="tc-block"
        data-level="subtopic"
        data-drag-active={isBeingDragged ? 'true' : undefined}
        data-hover-level={isHovered ? 'subtopic' : undefined}
        onMouseEnter={() => handleHoverEnter(block.id, 'subtopic')}
        onMouseLeave={handleHoverLeave}
      >
        <div className="tc-block__header">
          {/* Sub-Topic drag handle — locks rootId to THIS block only */}
          <div
            className="tc-handle"
            onMouseDown={(e) => handleDragStart(e, 'subtopic', block.id, block.dayIndex)}
            title="Drag this sub-topic"
          >
            <GripVertical />
          </div>
          <span className="tc-block__title">{mod.asset_name || 'Untitled'}</span>
        </div>
        <div className="tc-block__meta">
          {mod.duration && (
            <span className="tc-block__badge tc-block__badge--duration">
              <Clock size={9} style={{ marginRight: 2 }} />{mod.duration}
            </span>
          )}
          {(mod.difficultyLevel || mod.difficulty) && (
            <span className="tc-block__badge tc-block__badge--difficulty">
              D:{mod.difficultyLevel || mod.difficulty}
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderDayColumn = (dayIndex: number) => {
    const dayBlocks = blocksByDay.get(dayIndex) || [];
    const isDropTarget = dropTarget === dayIndex && dragData !== null;

    // Group blocks by lesson → topic for rendering hierarchy
    const lessonGroups = new Map<string, Map<string, CalendarBlock[]>>();
    dayBlocks.forEach(b => {
      if (!lessonGroups.has(b.lessonKey)) lessonGroups.set(b.lessonKey, new Map());
      const topics = lessonGroups.get(b.lessonKey)!;
      if (!topics.has(b.topicKey)) topics.set(b.topicKey, []);
      topics.get(b.topicKey)!.push(b);
    });

    return (
      <div key={dayIndex} className="timeline-calendar__day-column">
        <div className="timeline-calendar__day-header">
          <span className="day-date">{weekDates[dayIndex].getDate()}</span>
          {DAY_NAMES[dayIndex]}
        </div>
        <div
          className={`timeline-calendar__day-body ${isDropTarget ? 'drop-target' : ''}`}
        >
          {dayBlocks.length === 0 && !isDropTarget && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', textAlign: 'center', padding: '1rem 0.25rem', opacity: 0.5 }}>
              Drop items here
            </div>
          )}

          {Array.from(lessonGroups.entries()).map(([lessonKey, topicsMap]) => {
            const lessonBlocks = Array.from(topicsMap.values()).flat();
            const isLessonDragged = dragData?.rootId === lessonKey;
            const isLessonHovered = hoverState?.id === lessonKey && hoverState?.level === 'lesson';
            const firstBlock = lessonBlocks[0];

            // Only show lesson wrapper if there are multiple topics/blocks
            const showLessonGroup = lessonBlocks.length > 1;

            if (!showLessonGroup) {
              // Single block — render directly without lesson/topic wrappers
              return lessonBlocks.map(b => renderBlock(b));
            }

            return (
              <div
                key={lessonKey}
                className="tc-group tc-group--lesson"
                data-drag-active={isLessonDragged ? 'true' : undefined}
                data-hover-level={isLessonHovered ? 'lesson' : undefined}
                onMouseEnter={() => handleHoverEnter(lessonKey, 'lesson')}
                onMouseLeave={handleHoverLeave}
              >
                <div className="tc-group__label">
                  {/* Lesson-level drag handle — locks rootId to LESSON */}
                  <div
                    className="tc-handle"
                    onMouseDown={(e) => handleDragStart(e, 'lesson', lessonKey, firstBlock?.dayIndex ?? 0)}
                    title="Drag entire lesson group"
                  >
                    <GripVertical />
                  </div>
                  <BookOpen size={11} />
                  {firstBlock?.module.lesson || 'Lesson'}
                </div>

                {Array.from(topicsMap.entries()).map(([topicKey, topicBlocks]) => {
                  const isTopicDragged = dragData?.rootId === topicKey;
                  const isTopicHovered = hoverState?.id === topicKey && hoverState?.level === 'topic';
                  const showTopicGroup = topicBlocks.length > 1;

                  if (!showTopicGroup) {
                    return topicBlocks.map(b => renderBlock(b));
                  }

                  return (
                    <div
                      key={topicKey}
                      className="tc-group tc-group--topic"
                      data-drag-active={isTopicDragged ? 'true' : undefined}
                      data-hover-level={isTopicHovered ? 'topic' : undefined}
                      onMouseEnter={(e) => { e.stopPropagation(); handleHoverEnter(topicKey, 'topic'); }}
                      onMouseLeave={(e) => { e.stopPropagation(); handleHoverLeave(); }}
                    >
                      <div className="tc-group__label">
                        {/* Topic-level drag handle — locks rootId to TOPIC */}
                        <div
                          className="tc-handle"
                          onMouseDown={(e) => handleDragStart(e, 'topic', topicKey, topicBlocks[0]?.dayIndex ?? 0)}
                          title="Drag entire topic group"
                        >
                          <GripVertical />
                        </div>
                        <Layers size={10} />
                        {topicBlocks[0]?.module.curriculumTopic || topicBlocks[0]?.module.topic || 'Topic'}
                      </div>
                      {topicBlocks.map(b => renderBlock(b))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ===========================================================================
  // MAIN RENDER
  // ===========================================================================

  // Empty state
  if (!path || !path.modules || path.modules.length === 0) {
    if (loading) {
      return (
        <div className="timeline-calendar__empty">
          <Calendar size={48} style={{ opacity: 0.4, color: 'var(--accent-color)' }} />
          <h3>Preparing Calendar...</h3>
          <p>Building your visual timeline from the generated learning path.</p>
        </div>
      );
    }
    return (
      <div className="timeline-calendar__empty">
        <Calendar size={48} style={{ opacity: 0.3 }} />
        <h3>No Schedule Active</h3>
        <p>
          Generate a learning path from the Manual Path or AI Path tab first,
          then switch here to visually schedule and arrange it on a weekly calendar.
        </p>
      </div>
    );
  }

  return (
    <div className="timeline-calendar" ref={calendarRef}>
      {/* Toolbar */}
      <div className="timeline-calendar__toolbar">
        <div>
          <h2>{path.title || 'Visual Schedule'}</h2>
          <p>Drag handles to reschedule lessons, topics, or individual sub-topics across days.</p>
        </div>
        <div className="timeline-calendar__week-nav">
          <button onClick={() => setWeekOffset(w => w - 1)} title="Previous week">
            <ChevronLeft size={14} />
          </button>
          <span className="timeline-calendar__week-label">
            {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' — '}
            {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} title="Next week">
            <ChevronRight size={14} />
          </button>
          <button onClick={() => setWeekOffset(0)} title="Jump to current week">
            Today
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="timeline-calendar__kpi-bar">
        <div className="timeline-calendar__kpi">
          <div>
            <div className="timeline-calendar__kpi-value">{totalBlocks}</div>
            <div className="timeline-calendar__kpi-label">Total Blocks</div>
          </div>
        </div>
        <div className="timeline-calendar__kpi">
          <div>
            <div className="timeline-calendar__kpi-value">{uniqueLessons}</div>
            <div className="timeline-calendar__kpi-label">Lessons</div>
          </div>
        </div>
        <div className="timeline-calendar__kpi">
          <div>
            <div className="timeline-calendar__kpi-value">{uniqueTopics}</div>
            <div className="timeline-calendar__kpi-label">Topic Groups</div>
          </div>
        </div>
        <div className="timeline-calendar__kpi">
          <div>
            <div className="timeline-calendar__kpi-value">{path.totalDuration || '—'}</div>
            <div className="timeline-calendar__kpi-label">Total Duration</div>
          </div>
        </div>
      </div>

      {/* 7-Day Grid */}
      <div className="timeline-calendar__grid">
        {Array.from({ length: 7 }, (_, i) => renderDayColumn(i))}
      </div>

      {/* Drag Ghost (floating element) */}
      {ghostState.visible && (
        <div
          ref={ghostRef}
          className="tc-drag-ghost"
          style={{
            left: ghostState.x + 12,
            top: ghostState.y - 12,
          }}
        >
          {ghostState.content}
        </div>
      )}
    </div>
  );
};
