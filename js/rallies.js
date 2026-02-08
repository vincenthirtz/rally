// Rally Photo — Multi-Rally Registry
// Loaded FIRST. Defines global registry and convenience aliases.

const RALLIES = [];
let currentRally = null;

// Convenience globals — set by setCurrentRally(), consumed by all modules
var CHECKPOINTS = [];
var TOTAL_POINTS = 0;
var TOTAL_BONUS = 0;
var TOTAL_QUIZ = 0;
const QUIZ_POINTS = { 1: 5, 2: 10, 3: 15 };

function setCurrentRally(rallyId) {
  currentRally = RALLIES.find(r => r.id === rallyId);
  if (!currentRally) return false;
  CHECKPOINTS = currentRally.checkpoints;
  TOTAL_POINTS = CHECKPOINTS.reduce((sum, cp) => sum + cp.points, 0);
  TOTAL_BONUS = CHECKPOINTS.reduce((sum, cp) => sum + (cp.bonusPoints || 0), 0);
  TOTAL_QUIZ = CHECKPOINTS.reduce((sum, cp) => sum + (cp.quiz ? (QUIZ_POINTS[cp.quiz.difficulty] || 0) : 0), 0);
  return true;
}

// Storage key helpers — all modules use these instead of hardcoded keys
function getStorageKey() { return "rallyPhoto_" + (currentRally ? currentRally.id : "normandie"); }
function getTeamsKey() { return "rallyPhoto_" + (currentRally ? currentRally.id : "normandie") + "_teams"; }
function getAchievementsSeenKey() { return "rallyAchievements_" + (currentRally ? currentRally.id : "normandie"); }
