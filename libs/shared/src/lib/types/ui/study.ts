export type StudyQuestionType = "trueOrFalse" | "multipleChoice";
export type StudyAskDirection = "term" | "definition" | "both";

export type StudyDotStatus = "unseen" | "inProgress" | "wrong" | "recovering" | "mastered";

export interface StudyQueueItem {
  cardId: string;
  answerWith: "term" | "definition";
  askWith: "term" | "definition";
  questionType: StudyQuestionType;
  wasEverWrong: boolean;
  attemptCount: number;
  isConfirmation: boolean;
}

export interface StudySessionState {
  queue: StudyQueueItem[];
  pointer: number;
  dotsByCardId: Record<string, StudyDotStatus>;
}
