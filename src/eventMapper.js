/**
 * Event Mapper Module
 * Maps Teams text/Adaptive Card actions to AG-UI events
 * Provides extensible event handler registration and dispatch
 */

const eventHandlers = {};

/**
 * Register an event handler for a specific event type
 * @param {string} eventType - Event type identifier (e.g., "agent:finops:selectResource")
 * @param {Function} handler - Async handler function(context, { agentId, data })
 */
function registerEventHandler(eventType, handler) {
  eventHandlers[eventType] = handler;
  console.log(`[Event Mapper] Registered handler for: ${eventType}`);
}

/**
 * Dispatch an event to its registered handler
 * @param {Object} context - Bot activity context
 * @param {string} eventType - Event type identifier
 * @param {string} agentId - Source agent identifier
 * @param {Object} data - Event payload data
 */
async function dispatchEvent(context, eventType, agentId, data) {
  const handler = eventHandlers[eventType];
  const fallbackHandler = eventHandlers[`*:${eventType}`]; // Wildcard fallback

  const resolvedHandler = handler || fallbackHandler;

  if (!resolvedHandler) {
    console.warn(`[Event Mapper] No handler for: ${eventType}`);
    await context.sendActivity(`⚠️ Event handler not found for: ${eventType}`);
    return;
  }

  try {
    await resolvedHandler(context, { agentId, data });
  } catch (err) {
    console.error(`[Event Mapper] Error handling ${eventType}:`, err.message);
    await context.sendActivity(`❌ Error processing event: ${err.message}`);
  }
}

/**
 * Get all registered event handlers (for debugging/inspection)
 */
function getRegisteredHandlers() {
  return Object.keys(eventHandlers);
}

module.exports = {
  registerEventHandler,
  dispatchEvent,
  getRegisteredHandlers,
};
