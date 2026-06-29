import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { Meta, Title } from "@angular/platform-browser";
import { faVolumeHigh, faLightbulb, faSpinner } from "@fortawesome/free-solid-svg-icons";
import {
  AiEnrichedCard,
  StudyAskDirection,
  StudyDotStatus,
  StudyQueueItem,
  StudySessionState,
  Set
} from "@scholarsome/shared";
import { SetsService } from "../../shared/http/sets.service";
import { AiService } from "../../shared/http/ai.service";
import { TtsService } from "../../shared/http/tts.service";
import { FsrsService } from "../../shared/http/fsrs.service";
import { applyAnswerResult, buildInitialQueue } from "./study-queue.util";

interface DotViewModel {
  cardId: string;
  status: StudyDotStatus;
}

interface StudyQuestionViewModel {
  cardId: string;
  questionType: "trueOrFalse" | "multipleChoice";
  questionText: string;
  promptText: string;
  answer: string;
  options?: string[];
  trueIsCorrect?: boolean;
}

@Component({
  selector: "scholarsome-study-set-study",
  templateUrl: "./study-set-study.component.html",
  styleUrls: ["./study-set-study.component.scss"]
})
export class StudySetStudyComponent implements OnInit {
  constructor(
    private readonly setsService: SetsService,
    private readonly aiService: AiService,
    private readonly ttsService: TtsService,
    private readonly fsrsService: FsrsService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly titleService: Title,
    private readonly metaService: Meta
  ) {}

  setId: string | null = null;
  set: Set | null = null;

  aiAvailable = false;
  loaded = false;
  starting = false;
  started = false;
  completed = false;

  blockedMessage: string | null = null;

  explanation: string | null = null;
  explanationLoading = false;

  askDirection: StudyAskDirection = "definition";
  trueOrFalseEnabled = true;
  multipleChoiceEnabled = true;

  activeQuestion: StudyQuestionViewModel | null = null;
  sessionState: StudySessionState | null = null;

  cardOrder: string[] = [];

  readonly faVolumeHigh = faVolumeHigh;
  readonly faLightbulb = faLightbulb;
  readonly faSpinner = faSpinner;

  private readonly cardsById = new Map<string, Set["cards"][number]>();
  private readonly enrichedByCardId = new Map<string, AiEnrichedCard>();
  private readonly wrongCardIds = new Set<string>();

  get dots(): DotViewModel[] {
    if (!this.sessionState) return [];

    return this.cardOrder.map((cardId) => ({
      cardId,
      status: this.sessionState?.dotsByCardId[cardId] ?? "unseen"
    }));
  }

  get recoveredCount(): number {
    return this.wrongCardIds.size;
  }

  get firstTryMasteredCount(): number {
    return Math.max(this.cardOrder.length - this.wrongCardIds.size, 0);
  }

  async ngOnInit(): Promise<void> {
    this.setId = this.route.snapshot.paramMap.get("setId");

    if (!this.setId) {
      await this.router.navigate(["/404"]);
      return;
    }

    this.aiAvailable = await this.aiService.available();

    const set = await this.setsService.set(this.setId);

    if (!set) {
      await this.router.navigate(["/404"]);
      return;
    }

    this.set = set;

    const sortedCards = [...set.cards].sort((a, b) => a.index - b.index);
    this.cardOrder = sortedCards.map((card) => card.id);

    for (const card of sortedCards) {
      this.cardsById.set(card.id, card);
    }

    this.titleService.setTitle(`${set.title} Study Mode — Scholarsome`);
    this.metaService.addTag({
      name: "description",
      content: `Study ${set.title} with one-at-a-time AI-generated true/false and multiple-choice questions.`
    });

    if (!this.aiAvailable) {
      this.blockedMessage = "Study mode is unavailable because AI enrichment is currently offline.";
    }

    this.loaded = true;
  }

  async startSession(): Promise<void> {
    if (!this.set || !this.setId) return;

    if (!this.aiAvailable) {
      this.blockedMessage = "Study mode requires AI and cannot start right now.";
      return;
    }

    this.starting = true;
    this.blockedMessage = null;
    this.completed = false;
    this.activeQuestion = null;
    this.wrongCardIds.clear();
    this.enrichedByCardId.clear();

    const enrichedCards = await this.aiService.enrich(this.setId);

    this.starting = false;

    if (!enrichedCards || enrichedCards.length === 0) {
      this.blockedMessage = "Study mode could not start because AI enrichment failed for this set.";
      return;
    }

    for (const card of enrichedCards) {
      this.enrichedByCardId.set(card.cardId, card);
    }

    this.sessionState = buildInitialQueue(this.set.cards, {
      askDirection: this.askDirection,
      trueOrFalseEnabled: this.trueOrFalseEnabled,
      multipleChoiceEnabled: this.multipleChoiceEnabled
    });

    if (this.sessionState.queue.length === 0) {
      this.blockedMessage = "No cards are available for Study mode in this set.";
      return;
    }

    this.started = true;
    this.setActiveQuestion();
  }

  selectMultipleChoice(option: string): void {
    if (!this.activeQuestion || this.activeQuestion.questionType !== "multipleChoice") return;
    this.applyAnswer(option === this.activeQuestion.answer, this.activeQuestion.cardId);
  }

  selectTrueOrFalse(answer: boolean): void {
    if (!this.activeQuestion || this.activeQuestion.questionType !== "trueOrFalse") return;
    this.applyAnswer(answer === this.activeQuestion.trueIsCorrect, this.activeQuestion.cardId);
  }

  private applyAnswer(wasCorrect: boolean, cardId: string): void {
    if (!this.sessionState) return;

    if (!wasCorrect) {
      this.wrongCardIds.add(cardId);
    }

    this.sessionState = applyAnswerResult(
        this.sessionState.queue,
        this.sessionState.pointer,
        wasCorrect,
        this.sessionState.dotsByCardId
    );

    if (this.sessionState.dotsByCardId[cardId] === "mastered") {
      const rating = this.wrongCardIds.has(cardId) ? 2 : 3;
      this.fsrsService.submitReview(cardId, rating as 2 | 3);
    }

    this.setActiveQuestion();
  }

  speakQuestion(): void {
    if (!this.activeQuestion) return;
    const text = this.activeQuestion.questionType === "trueOrFalse" ?
      `${this.activeQuestion.questionText}. ${this.activeQuestion.promptText}` :
      this.activeQuestion.questionText;
    this.ttsService.speak(text);
  }

  async explainCard(): Promise<void> {
    if (!this.activeQuestion || !this.setId) return;
    this.explanation = null;
    this.explanationLoading = true;
    this.explanation = await this.aiService.explain(this.activeQuestion.cardId, this.setId);
    this.explanationLoading = false;
  }

  private setActiveQuestion(): void {
    this.explanation = null;
    if (!this.sessionState || this.sessionState.pointer < 0) {
      this.activeQuestion = null;
      this.completed = true;
      return;
    }

    const item = this.sessionState.queue[this.sessionState.pointer];

    if (!item) {
      this.activeQuestion = null;
      this.completed = true;
      return;
    }

    const card = this.cardsById.get(item.cardId);

    if (!card) {
      this.sessionState = applyAnswerResult(this.sessionState.queue, this.sessionState.pointer, true, this.sessionState.dotsByCardId);
      this.setActiveQuestion();
      return;
    }

    this.activeQuestion = this.buildQuestion(item, card);
  }

  private buildQuestion(item: StudyQueueItem, card: Set["cards"][number]): StudyQuestionViewModel {
    const enrichedCard = this.enrichedByCardId.get(item.cardId);
    const questionText = this.getQuestionText(item, card, enrichedCard);
    const answer = this.sanitizeHtml(card[item.answerWith]);

    if (item.questionType === "multipleChoice") {
      const options = this.getMultipleChoiceOptions(item, answer, enrichedCard);

      return {
        cardId: card.id,
        questionType: "multipleChoice",
        questionText,
        promptText: "Choose one option",
        answer,
        options
      };
    }

    const trueOrFalse = this.getTrueOrFalsePrompt(item, answer, enrichedCard);

    return {
      cardId: card.id,
      questionType: "trueOrFalse",
      questionText,
      promptText: trueOrFalse.statement,
      answer,
      trueIsCorrect: trueOrFalse.trueIsCorrect
    };
  }

  private getQuestionText(item: StudyQueueItem, card: Set["cards"][number], enrichedCard?: AiEnrichedCard): string {
    if (item.askWith === "term") {
      return enrichedCard?.termQuestion ?? this.sanitizeHtml(card.term);
    }

    return enrichedCard?.definitionQuestion ?? this.sanitizeHtml(card.definition);
  }

  private getMultipleChoiceOptions(item: StudyQueueItem, answer: string, enrichedCard?: AiEnrichedCard): string[] {
    const options = [answer];
    const aiDistractors = item.answerWith === "term" ?
      enrichedCard?.termDistractors :
      enrichedCard?.definitionDistractors;

    if (aiDistractors && aiDistractors.length === 3) {
      const filtered = aiDistractors
          .map((value) => value.trim())
          .filter((value) => value.length > 0 && value !== answer);

      if (new Set(filtered).size === 3) {
        options.push(...filtered);
      }
    }

    if (options.length < 4) {
      const fallbackValues = Array.from(this.cardsById.values())
          .map((card) => this.sanitizeHtml(card[item.answerWith]))
          .filter((value) => value.length > 0 && value !== answer && !options.includes(value));

      while (options.length < 4 && fallbackValues.length > 0) {
        const index = Math.floor(Math.random() * fallbackValues.length);
        options.push(fallbackValues[index]);
        fallbackValues.splice(index, 1);
      }
    }

    return options.sort(() => 0.5 - Math.random());
  }

  private getTrueOrFalsePrompt(
      item: StudyQueueItem,
      answer: string,
      enrichedCard?: AiEnrichedCard
  ): { statement: string; trueIsCorrect: boolean } {
    const useTrueStatement = Math.random() < 0.5;
    const statementPair = item.answerWith === "term" ?
      enrichedCard?.termTrueFalseStatements :
      enrichedCard?.definitionTrueFalseStatements;

    if (statementPair) {
      return {
        statement: useTrueStatement ? statementPair.trueStatement : statementPair.falseStatement,
        trueIsCorrect: useTrueStatement
      };
    }

    const fallbackDistractors = item.answerWith === "term" ?
      enrichedCard?.termDistractors :
      enrichedCard?.definitionDistractors;

    const falseStatement = fallbackDistractors?.find((value) => value.trim() !== answer) ??
      Array.from(this.cardsById.values())
          .map((card) => this.sanitizeHtml(card[item.answerWith]))
          .find((value) => value !== answer) ??
      answer;

    return {
      statement: useTrueStatement ? answer : falseStatement,
      trueIsCorrect: useTrueStatement
    };
  }

  private sanitizeHtml(value: string): string {
    return value.replace(/<[^>]+>/g, "").trim();
  }
}
