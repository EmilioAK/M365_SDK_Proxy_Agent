/**
 * AG-UI adapter utilities.
 *
 * This module keeps AG-UI as the domain event model and uses Adaptive Cards
 * only as a channel-specific rendering format for Teams/M365.
 */

function aguiUiToAdaptiveCard(aguiUi, options = {}) {
  if (!aguiUi || typeof aguiUi !== "object") {
    return null;
  }

  const agentId = options.agentId || aguiUi.agentId || null;
  const kind = aguiUi.kind || "choice-list";

  if (kind !== "choice-list") {
    return {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: "1.4",
      body: [
        {
          type: "TextBlock",
          text: aguiUi.title || "AG-UI",
          weight: "bolder",
          size: "medium",
          wrap: true,
        },
        {
          type: "TextBlock",
          text: aguiUi.description || "Unsupported AG-UI kind for card rendering.",
          wrap: true,
          spacing: "Small",
        },
      ],
    };
  }

  const choices = Array.isArray(aguiUi.choices) ? aguiUi.choices : [];
  const facts = choices
    .filter((c) => c.description)
    .map((c) => ({ title: c.label || c.id || "Choice", value: c.description }));

  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: aguiUi.title || "Select an option",
        weight: "bolder",
        size: "medium",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: aguiUi.description || "",
        wrap: true,
        spacing: "Small",
      },
      ...(facts.length
        ? [
            {
              type: "FactSet",
              facts,
              spacing: "Medium",
            },
          ]
        : []),
    ],
    actions: choices.map((choice) => ({
      type: "Action.Submit",
      title: choice.label || choice.id || "Choose",
      data: {
        eventType: choice.eventType || aguiUi.defaultEventType || "agui:action",
        agentId,
        actionId: choice.id || choice.label || "action",
        ...(choice.payload || {}),
      },
    })),
  };
}

function adaptiveSubmitToAguiEvent(value, context = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const eventType = value.eventType || value.type || null;
  if (!eventType) {
    return null;
  }

  const { eventType: _discard1, type: _discard2, agentId, ...payload } = value;
  return {
    type: eventType,
    agentId: agentId || context.agentId || null,
    payload,
    context,
  };
}

module.exports = {
  aguiUiToAdaptiveCard,
  adaptiveSubmitToAguiEvent,
};
