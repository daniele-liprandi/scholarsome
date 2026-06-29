import { StudyAskDirection, StudyQuestionType, StudySessionState, StudyQueueItem } from "@scholarsome/shared";

interface QueueCardInput {
  id: string;
  index: number;
}

interface BuildInitialQueueSettings {
  askDirection: StudyAskDirection;
  trueOrFalseEnabled: boolean;
  multipleChoiceEnabled: boolean;
  random?: () => number;
}

export function buildInitialQueue(cards: QueueCardInput[], settings: BuildInitialQueueSettings): StudySessionState {
  const random = settings.random ?? Math.random;

  const queue: StudyQueueItem[] = cards
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((card) => {
        const answerWith = getAnswerWith(settings.askDirection, random);

        return {
          cardId: card.id,
          answerWith,
          askWith: answerWith === "term" ? "definition" : "term",
          questionType: getQuestionType(settings, random),
          wasEverWrong: false,
          attemptCount: 0,
          isConfirmation: false
        };
      });

  const dotsByCardId = cards.reduce((accumulator, card) => {
    accumulator[card.id] = "unseen";
    return accumulator;
  }, {} as StudySessionState["dotsByCardId"]);

  if (queue.length > 0) {
    dotsByCardId[queue[0].cardId] = "inProgress";
  }

  return {
    queue,
    pointer: queue.length > 0 ? 0 : -1,
    dotsByCardId
  };
}

export function applyAnswerResult(
    queue: StudyQueueItem[],
    pointer: number,
    wasCorrect: boolean,
    dotsByCardId: StudySessionState["dotsByCardId"]
): StudySessionState {
  if (pointer < 0 || pointer >= queue.length) {
    return {
      queue,
      pointer,
      dotsByCardId
    };
  }

  const current = queue[pointer];
  const nextQueue = [...queue];
  const nextDots = { ...dotsByCardId };

  nextQueue.splice(pointer, 1);

  if (!wasCorrect) {
    nextDots[current.cardId] = "wrong";

    const retryItem: StudyQueueItem = {
      ...current,
      wasEverWrong: true,
      attemptCount: current.attemptCount + 1,
      isConfirmation: false
    };

    const insertionIndex = Math.min(pointer + 4, nextQueue.length);
    nextQueue.splice(insertionIndex, 0, retryItem);
  } else if (current.isConfirmation) {
    nextDots[current.cardId] = "mastered";
  } else if (current.wasEverWrong) {
    nextDots[current.cardId] = "recovering";

    const confirmationItem: StudyQueueItem = {
      ...current,
      attemptCount: current.attemptCount + 1,
      isConfirmation: true
    };

    nextQueue.push(confirmationItem);
  } else {
    nextDots[current.cardId] = "mastered";
  }

  const nextPointer = nextQueue.length === 0 ? -1 : Math.min(pointer, nextQueue.length - 1);

  if (nextPointer >= 0) {
    const nextCardId = nextQueue[nextPointer].cardId;

    if (nextDots[nextCardId] === "unseen") {
      nextDots[nextCardId] = "inProgress";
    }
  }

  return {
    queue: nextQueue,
    pointer: nextPointer,
    dotsByCardId: nextDots
  };
}

export function nextPointer(state: StudySessionState): number {
  if (state.queue.length === 0) {
    return -1;
  }

  return Math.min(state.pointer, state.queue.length - 1);
}

function getAnswerWith(askDirection: StudyAskDirection, random: () => number): "term" | "definition" {
  if (askDirection === "both") {
    return random() < 0.5 ? "term" : "definition";
  }

  return askDirection;
}

function getQuestionType(settings: BuildInitialQueueSettings, random: () => number): StudyQuestionType {
  if (settings.trueOrFalseEnabled && settings.multipleChoiceEnabled) {
    return random() < 0.5 ? "trueOrFalse" : "multipleChoice";
  }

  if (settings.trueOrFalseEnabled) {
    return "trueOrFalse";
  }

  return "multipleChoice";
}
