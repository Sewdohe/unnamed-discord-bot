/**
 * Spam Detection Utility
 *
 * Detects spam messages using similarity comparison instead of exact matches.
 * This catches messages that are slightly altered to bypass simple duplicate detection.
 */

interface MessageRecord {
  content: string;
  normalized: string;
  timestamp: number;
  messageId: string;
}

interface UserMessages {
  messages: MessageRecord[];
  lastCleanup: number;
}

// In-memory cache of recent messages per user per guild
// Structure: Map<guildId, Map<userId, UserMessages>>
const messageCache = new Map<string, Map<string, UserMessages>>();

// Cleanup interval (remove old messages every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

/**
 * Normalize a message for similarity comparison
 * - Lowercase
 * - Remove extra whitespace
 * - Remove common punctuation
 * - Remove URLs
 */
function normalizeMessage(content: string): string {
  return content
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, '') // Remove URLs
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Calculate similarity between two strings using a simple ratio
 * Returns a percentage (0-100)
 */
function calculateSimilarity(str1: string, str2: string): number {
  // Quick exact match check
  if (str1 === str2) return 100;

  // Length-based quick rejection
  const maxLen = Math.max(str1.length, str2.length);
  const minLen = Math.min(str1.length, str2.length);

  if (maxLen === 0) return 100; // Both empty
  if (minLen === 0) return 0; // One is empty

  // If lengths differ by more than 50%, likely not spam
  if (minLen / maxLen < 0.5) return 0;

  // Calculate Levenshtein distance
  const distance = levenshteinDistance(str1, str2);

  // Convert to similarity percentage
  const similarity = (1 - distance / maxLen) * 100;

  return Math.max(0, Math.min(100, similarity));
}

/**
 * Calculate Levenshtein distance between two strings
 * (minimum number of single-character edits required to change one string into the other)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  // Create matrix
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  // Initialize first column and row
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Add a message to the user's history
 */
export function trackMessage(
  guildId: string,
  userId: string,
  messageId: string,
  content: string
): void {
  // Get or create guild cache
  let guildCache = messageCache.get(guildId);
  if (!guildCache) {
    guildCache = new Map();
    messageCache.set(guildId, guildCache);
  }

  // Get or create user messages
  let userMessages = guildCache.get(userId);
  if (!userMessages) {
    userMessages = {
      messages: [],
      lastCleanup: Date.now(),
    };
    guildCache.set(userId, userMessages);
  }

  // Add message
  userMessages.messages.push({
    content,
    normalized: normalizeMessage(content),
    timestamp: Date.now(),
    messageId,
  });
}

/**
 * Check if a user is spamming based on recent message history
 *
 * @returns Object with isSpam flag and matched messages if spam detected
 */
export function checkForSpam(
  guildId: string,
  userId: string,
  messageContent: string,
  config: {
    similarityThreshold: number; // 0-100
    messageThreshold: number; // Number of similar messages
    timeWindow: number; // Seconds
  }
): { isSpam: boolean; matchedMessages: string[]; similarMessages: number } {
  const guildCache = messageCache.get(guildId);
  if (!guildCache) {
    return { isSpam: false, matchedMessages: [], similarMessages: 0 };
  }

  const userMessages = guildCache.get(userId);
  if (!userMessages) {
    return { isSpam: false, matchedMessages: [], similarMessages: 0 };
  }

  // Clean up old messages
  const now = Date.now();
  const timeWindowMs = config.timeWindow * 1000;

  // Periodic cleanup (every 5 minutes)
  if (now - userMessages.lastCleanup > CLEANUP_INTERVAL) {
    userMessages.messages = userMessages.messages.filter(
      msg => now - msg.timestamp < timeWindowMs
    );
    userMessages.lastCleanup = now;
  }

  // Get recent messages within time window
  const recentMessages = userMessages.messages.filter(
    msg => now - msg.timestamp < timeWindowMs
  );

  if (recentMessages.length < config.messageThreshold - 1) {
    // Not enough messages to trigger spam detection
    return { isSpam: false, matchedMessages: [], similarMessages: 0 };
  }

  // Normalize current message
  const normalized = normalizeMessage(messageContent);

  // Check similarity with recent messages
  const similarMessages: MessageRecord[] = [];

  for (const msg of recentMessages) {
    const similarity = calculateSimilarity(normalized, msg.normalized);

    if (similarity >= config.similarityThreshold) {
      similarMessages.push(msg);
    }
  }

  // Check if threshold is met
  const isSpam = similarMessages.length >= config.messageThreshold - 1; // -1 because current message counts

  return {
    isSpam,
    matchedMessages: similarMessages.map(m => m.messageId),
    similarMessages: similarMessages.length + 1, // +1 for current message
  };
}

/**
 * Clear message history for a user (e.g., after taking action)
 */
export function clearUserHistory(guildId: string, userId: string): void {
  const guildCache = messageCache.get(guildId);
  if (!guildCache) return;

  guildCache.delete(userId);
}

/**
 * Clear all message history for a guild
 */
export function clearGuildHistory(guildId: string): void {
  messageCache.delete(guildId);
}

/**
 * Get statistics about the message cache (for debugging)
 */
export function getCacheStats(): {
  guilds: number;
  totalUsers: number;
  totalMessages: number;
} {
  let totalUsers = 0;
  let totalMessages = 0;

  for (const guildCache of messageCache.values()) {
    totalUsers += guildCache.size;
    for (const userMessages of guildCache.values()) {
      totalMessages += userMessages.messages.length;
    }
  }

  return {
    guilds: messageCache.size,
    totalUsers,
    totalMessages,
  };
}
