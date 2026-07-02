import { Component, HostListener, OnInit, TemplateRef, ViewChild } from "@angular/core";
import { SetsService } from "../../shared/http/sets.service";
import { ActivatedRoute, Router } from "@angular/router";
import { Card } from "@prisma/client";
import { BsModalRef } from "ngx-bootstrap/modal";
import { faThumbsUp, faCake, faVolumeHigh, faLightbulb, faSpinner, faArrowUpLong } from "@fortawesome/free-solid-svg-icons";
import { selectByPriority } from "./priority-selection.util";
import { DomSanitizer, Meta, Title } from "@angular/platform-browser";
import { NgForm } from "@angular/forms";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { AiService, AI_IMAGE_ONLY } from "../../shared/http/ai.service";
import { TtsService } from "../../shared/http/tts.service";
import { FsrsService } from "../../shared/http/fsrs.service";
import { UsersService } from "../../shared/http/users.service";
import { CardFsrsStateResponse, FsrsRating } from "@scholarsome/shared";

@Component({
  selector: "scholarsome-study-set-flashcards",
  templateUrl: "./study-set-flashcards.component.html",
  styleUrls: ["./study-set-flashcards.component.scss"]
})
export class StudySetFlashcardsComponent implements OnInit {
  constructor(
    private readonly route: ActivatedRoute,
    private readonly sets: SetsService,
    private readonly router: Router,
    private readonly titleService: Title,
    private readonly metaService: Meta,
    public readonly sanitizer: DomSanitizer,
    private readonly aiService: AiService,
    private readonly ttsService: TtsService,
    private readonly fsrsService: FsrsService,
    private readonly usersService: UsersService
  ) {}

  @ViewChild("flashcardsConfig") configModal: TemplateRef<HTMLElement>;
  @ViewChild("completedRound") roundCompletedModal: TemplateRef<HTMLElement>;

  protected cards: Card[];
  protected setId: string | null;

  protected flashcardsMode: "browse" | "learn";
  protected shufflingEnabled = false;

  protected formFlashcardsType: "browse" | "learn" = "learn";
  protected formAnswerWith: "term" | "definition" = "definition";
  protected formEnableShuffling: "yes" | "no" = "yes";
  protected formLimitType: "all" | "cards" | "time" = "all";
  protected formLimitCards = 20;
  protected formLimitMinutes = 10;
  protected explanationImageOnly = false;

  protected knownCardIDs: string[] = [];
  protected roundCompleted = false;
  protected newLearnedCards = 0;

  protected answer: "definition" | "term";
  protected index = 0;
  protected currentCard: Card;

  protected side: string;
  protected sideText = "";
  protected remainingCards = "";

  protected flipped = false;
  protected flipInteraction = false;

  protected aiAvailable = false;
  protected explanation: string | null = null;
  protected explanationLoading = false;

  protected fsrsStates: CardFsrsStateResponse[] | null = null;
  protected fsrsStatesMap = new Map<string, CardFsrsStateResponse>();
  protected isGuest = false;

  protected modalRef?: BsModalRef;
  protected readonly faThumbsUp = faThumbsUp;
  protected readonly faCake = faCake;
  protected readonly faQuestionCircle = faQuestionCircle;
  protected readonly faVolumeHigh = faVolumeHigh;
  protected readonly faLightbulb = faLightbulb;
  protected readonly faSpinner = faSpinner;
  protected readonly faArrowUpLong = faArrowUpLong;

  private cardStartTime: number = Date.now();

  get fsrsDueCount(): number {
    if (!this.fsrsStates) return 0;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return this.fsrsStates.filter((s) => s.state !== 0 && new Date(s.due) <= endOfToday).length;
  }

  get currentFsrsDotClass(): string | null {
    if (this.isGuest || !this.cards || this.cards.length === 0) return null;
    const card = this.cards[this.index];
    if (!card) return null;
    const s = this.fsrsStatesMap.get(card.id);
    if (!s || s.state === 0) return null;
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const due = new Date(s.due);
    if (due <= now) return "dot-overdue";
    if (due <= endOfToday) return "dot-due";
    return "dot-known";
  }

  @HostListener("document:keypress", ["$event"])
  keyboardSpaceEvent(event: KeyboardEvent) {
    if (this.flashcardsMode && !this.roundCompleted && event.key === " ") {
      this.flipCard();
    }
  }

  @HostListener("document:keyup", ["$event"])
  keyboardArrowEvent(event: KeyboardEvent) {
    if (this.flashcardsMode && !this.roundCompleted) {
      if (event.key === "ArrowLeft") {
        if (this.flashcardsMode === "browse") {
          this.changeCard(-1);
        } else {
          this.changeCard(1);
        }
      } else if (event.key === "ArrowRight") {
        if (this.flashcardsMode === "browse") {
          this.changeCard(1);
        } else {
          this.incrementLearntCount();
          this.knownCardIDs.push(this.currentCard.id);
          this.changeCard(1);
        }
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        this.flipCard();
      }
    }
  }

  estimateCardCount(minutes: number): number {
    if (!this.cards || this.cards.length === 0) return 0;
    const targetMs = minutes * 60 * 1000;
    const stateMap = new Map<string, number | null>(
        (this.fsrsStates ?? []).map((s) => [s.cardId, s.avgReviewDurationMs])
    );
    let total = 0;
    let count = 0;
    for (const card of this.cards) {
      const avg = stateMap.get(card.id) ?? null;
      const textLen =
        card.term.replace(/<[^>]+>/g, "").length +
        card.definition.replace(/<[^>]+>/g, "").length;
      const ms = avg !== null ? avg : textLen * 100;
      if (total + ms > targetMs) break;
      total += ms;
      count++;
    }
    return Math.max(1, Math.min(count, this.cards.length));
  }

  get sessionCardPreview(): number {
    return this.estimateCardCount(this.formLimitMinutes);
  }

  updateIndex() {
    this.remainingCards = `${this.index + 1}/${this.cards.length}`;
  }

  incrementLearntCount(): void {
    this.newLearnedCards++;
  }

  flipCard(type?: string) {
    if (!type) {
      this.flipInteraction = true;
      this.flipped = !this.flipped;
    }

    setTimeout(() => {
      if (this.side === "term") {
        this.sideText = this.cards[this.index].definition;
        this.side = "definition";
      } else {
        this.sideText = this.cards[this.index].term;
        this.side = "term";
      }
    }, 150);
  }

  rateCard(rating: FsrsRating): void {
    const durationMs = Date.now() - this.cardStartTime;
    this.fsrsService.submitReview(this.currentCard.id, rating, durationMs);

    if (this.flashcardsMode === "learn") {
      if (rating >= 3) {
        this.incrementLearntCount();
        this.knownCardIDs.push(this.currentCard.id);
      }
      this.changeCard(1);
    } else {
      this.changeCard(1);
    }
  }

  changeCard(direction: number) {
    if (this.index === 0 && direction === -1) return;

    if (this.index === this.cards.length - 1 && direction === 1 && this.flashcardsMode === "browse") return;

    if (this.flashcardsMode === "learn" && this.index !== this.cards.length - 1) {
      this.currentCard = this.cards[this.index + 1];
    }

    if (this.index === this.cards.length - 1 && this.flashcardsMode === "learn") {
      this.cards = this.cards.filter((c) => !this.knownCardIDs.includes(c.id));

      this.roundCompleted = true;

      if (this.cards.length > 0) {
        this.index = 0;
        this.updateIndex();

        if (this.shufflingEnabled) this.cards = this.cards.sort(() => 0.5 - Math.random());

        this.sideText = this.cards[0][this.side as keyof Card] as string;
      }

      this.flipped = false;
      this.flipInteraction = false;
      this.currentCard = this.cards[0];

      return;
    }

    this.index += direction;
    this.updateIndex();

    this.flipInteraction = false;
    this.flipped = false;
    this.explanation = null;
    this.explanationImageOnly = false;
    this.cardStartTime = Date.now();

    if (this.answer === "definition") {
      this.side = "term";
    } else {
      this.side = "definition";
    }

    this.sideText =
      this.answer === "definition" ? this.cards[this.index].term : this.cards[this.index].definition;
  }

  beginFlashcards(form: NgForm) {
    this.flashcardsMode = form.value["flashcards-type"];
    this.answer = form.value["answer-with"];
    this.side = form.value["answer-with"] === "definition" ? "term" : "definition";

    if (form.value["enable-shuffling"] === "yes") {
      this.cards = this.cards.sort(() => 0.5 - Math.random());
      this.shufflingEnabled = true;
    }

    if (this.flashcardsMode === "learn") {
      let n: number | null = null;
      if (this.formLimitType === "cards") {
        n = Math.max(1, Math.min(this.formLimitCards, this.cards.length));
      } else if (this.formLimitType === "time") {
        n = this.estimateCardCount(this.formLimitMinutes);
      }
      if (n !== null) {
        if (this.shufflingEnabled) {
          this.cards = selectByPriority(this.cards, n);
        } else {
          this.cards = this.cards.slice(0, n);
        }
      }
    }

    this.sideText = this.cards[0][this.side as keyof Card] as string;
    this.currentCard = this.cards[0];
    this.cardStartTime = Date.now();
  }

  speakCard() {
    this.ttsService.speak(this.sideText);
  }

  async explainCard() {
    if (!this.currentCard || !this.setId) return;
    this.explanation = null;
    this.explanationImageOnly = false;
    this.explanationLoading = true;
    const result = await this.aiService.explain(this.currentCard.id, this.setId);
    if (result === AI_IMAGE_ONLY) {
      this.explanationImageOnly = true;
    } else {
      this.explanation = result;
    }
    this.explanationLoading = false;
  }

  reloadPage() {
    this.router.navigateByUrl("/", { skipLocationChange: true }).then(() => {
      this.router.navigate(["/study-set/" + this.setId + "/flashcards"]);
    });
  }

  async ngOnInit(): Promise<void> {
    this.setId = this.route.snapshot.paramMap.get("setId");
    if (!this.setId) {
      await this.router.navigate(["404"]);
      return;
    }

    const set = await this.sets.set(this.setId);
    if (!set) {
      await this.router.navigate(["404"]);
      return;
    }

    this.aiAvailable = await this.aiService.available();

    const user = await this.usersService.myUser();
    this.isGuest = !user;

    if (!this.isGuest) {
      this.fsrsStates = await this.fsrsService.getStatesForSet(this.setId);
      if (this.fsrsStates) {
        this.fsrsStatesMap = new Map(this.fsrsStates.map((s) => [s.cardId, s]));
      }
    }

    this.titleService.setTitle(set.title + " — Scholarsome");
    this.metaService.addTag({ name: "description", content: "Begin studying flashcards " + set.title + " study set on Scholarsome. Improve your memorization skills by taking a quiz." });

    this.cards = set.cards.sort((a, b) => a.index - b.index);

    this.updateIndex();
  }
}
