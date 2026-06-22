import { buildInitialQueue, applyAnswerResult, nextPointer } from "./study-queue.util";

const cards = [
  { id: "card-1", index: 0 },
  { id: "card-2", index: 1 },
  { id: "card-3", index: 2 },
  { id: "card-4", index: 3 },
  { id: "card-5", index: 4 },
  { id: "card-6", index: 5 }
];

describe("study-queue.util", () => {
  it("builds an initial queue and marks the first dot in progress", () => {
    const state = buildInitialQueue(cards, {
      askDirection: "both",
      trueOrFalseEnabled: true,
      multipleChoiceEnabled: true,
      random: () => 0.2
    });

    expect(state.queue.length).toBe(cards.length);
    expect(state.pointer).toBe(0);
    expect(state.dotsByCardId["card-1"]).toBe("inProgress");
    expect(state.queue.every((item) => item.questionType === "trueOrFalse")).toBe(true);
  });

  it("reinserts wrong answers four slots later", () => {
    const initial = buildInitialQueue(cards, {
      askDirection: "term",
      trueOrFalseEnabled: true,
      multipleChoiceEnabled: false,
      random: () => 0.2
    });

    const next = applyAnswerResult(initial.queue, initial.pointer, false, initial.dotsByCardId);

    expect(next.dotsByCardId["card-1"]).toBe("wrong");
    expect(next.queue[4].cardId).toBe("card-1");
    expect(next.queue[4].wasEverWrong).toBe(true);
  });

  it("moves right-after-wrong items to confirmation at queue end", () => {
    const initial = buildInitialQueue(cards, {
      askDirection: "term",
      trueOrFalseEnabled: true,
      multipleChoiceEnabled: false,
      random: () => 0.2
    });

    const wrong = applyAnswerResult(initial.queue, initial.pointer, false, initial.dotsByCardId);
    const cardIndex = wrong.queue.findIndex((item) => item.cardId === "card-1");
    const recovered = applyAnswerResult(wrong.queue, cardIndex, true, wrong.dotsByCardId);

    expect(recovered.dotsByCardId["card-1"]).toBe("recovering");
    expect(recovered.queue[recovered.queue.length - 1].cardId).toBe("card-1");
    expect(recovered.queue[recovered.queue.length - 1].isConfirmation).toBe(true);
  });

  it("retires first-try correct items permanently", () => {
    const initial = buildInitialQueue(cards, {
      askDirection: "definition",
      trueOrFalseEnabled: false,
      multipleChoiceEnabled: true,
      random: () => 0.8
    });

    const next = applyAnswerResult(initial.queue, initial.pointer, true, initial.dotsByCardId);

    expect(next.dotsByCardId["card-1"]).toBe("mastered");
    expect(next.queue.find((item) => item.cardId === "card-1")).toBeUndefined();
  });

  it("masters the card after a correct confirmation answer", () => {
    const initial = buildInitialQueue(cards, {
      askDirection: "term",
      trueOrFalseEnabled: true,
      multipleChoiceEnabled: false,
      random: () => 0.2
    });

    const wrong = applyAnswerResult(initial.queue, initial.pointer, false, initial.dotsByCardId);
    const retryIndex = wrong.queue.findIndex((item) => item.cardId === "card-1");
    const recovered = applyAnswerResult(wrong.queue, retryIndex, true, wrong.dotsByCardId);
    const confirmationIndex = recovered.queue.findIndex((item) => item.cardId === "card-1");
    const mastered = applyAnswerResult(recovered.queue, confirmationIndex, true, recovered.dotsByCardId);

    expect(mastered.dotsByCardId["card-1"]).toBe("mastered");
    expect(mastered.queue.find((item) => item.cardId === "card-1")).toBeUndefined();
  });

  it("returns -1 pointer when queue is exhausted", () => {
    const initial = buildInitialQueue([{ id: "single", index: 0 }], {
      askDirection: "term",
      trueOrFalseEnabled: true,
      multipleChoiceEnabled: false,
      random: () => 0.2
    });

    const next = applyAnswerResult(initial.queue, initial.pointer, true, initial.dotsByCardId);

    expect(nextPointer(next)).toBe(-1);
  });
});
