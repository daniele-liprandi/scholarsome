import { Component, HostListener, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { DomSanitizer } from "@angular/platform-browser";
import { FsrsReviewCard, FsrsRating } from "@scholarsome/shared";
import { FsrsService } from "../shared/http/fsrs.service";

@Component({
  selector: "scholarsome-review",
  templateUrl: "./review.component.html",
  styleUrls: []
})
export class ReviewComponent implements OnInit {
  constructor(
    private readonly fsrsService: FsrsService,
    private readonly router: Router,
    public readonly sanitizer: DomSanitizer
  ) {}

  cards: FsrsReviewCard[] = [];
  index = 0;
  flipped = false;
  flipInteraction = false;
  completed = false;
  loading = true;

  private cardStartTime = Date.now();

  get current(): FsrsReviewCard | null {
    return this.cards[this.index] ?? null;
  }

  get progress(): string {
    return `${this.index + 1} / ${this.cards.length}`;
  }

  @HostListener("document:keypress", ["$event"])
  onKeyPress(event: KeyboardEvent) {
    if (!this.completed && this.cards.length > 0 && event.key === " ") {
      this.flip();
    }
  }

  flip() {
    this.flipInteraction = true;
    this.flipped = !this.flipped;
  }

  rate(rating: FsrsRating) {
    if (!this.current) return;
    const durationMs = Date.now() - this.cardStartTime;
    this.fsrsService.submitReview(this.current.cardId, rating, durationMs);

    if (this.index >= this.cards.length - 1) {
      this.completed = true;
    } else {
      this.index++;
      this.flipped = false;
      this.flipInteraction = false;
      this.cardStartTime = Date.now();
    }
  }

  async ngOnInit(): Promise<void> {
    const queue = await this.fsrsService.getReviewQueue();
    this.loading = false;

    if (!queue || queue.length === 0) {
      this.completed = true;
      return;
    }

    this.cards = queue;
  }
}
