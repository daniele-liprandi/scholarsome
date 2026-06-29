import { Component, ElementRef, OnInit, ViewChild } from "@angular/core";
import { FsrsSetSummary, User } from "@scholarsome/shared";
import { Meta, Title } from "@angular/platform-browser";
import { UsersService } from "../shared/http/users.service";
import { FsrsService } from "../shared/http/fsrs.service";
import { Router } from "@angular/router";
import { faPlus, faClone, faFolder, faBrain } from "@fortawesome/free-solid-svg-icons";

@Component({
  selector: "scholarsome-view",
  templateUrl: "./homepage.component.html",
  styleUrls: ["./homepage.component.scss"]
})
export class HomepageComponent implements OnInit {
  constructor(
    private readonly usersService: UsersService,
    private readonly fsrsService: FsrsService,
    private readonly router: Router,
    private readonly titleService: Title,
    private readonly metaService: Meta
  ) {
    this.titleService.setTitle("Homepage — Scholarsome");
    this.metaService.addTag({ name: "description", content: "Scholarsome is the way studying was meant to be. No monthly fees or upsells to get between you and your study tools. Just flashcards." });
  }

  @ViewChild("container", { static: true }) container: ElementRef;
  @ViewChild("spinner", { static: true }) spinner: ElementRef;

  user: User;
  fsrsSummaries: FsrsSetSummary[] = [];

  protected readonly faClone = faClone;
  protected readonly faFolder = faFolder;
  protected readonly faPlus = faPlus;
  protected readonly faBrain = faBrain;

  getSummaryForSet(setId: string): FsrsSetSummary | null {
    return this.fsrsSummaries.find((s) => s.setId === setId) ?? null;
  }

  get totalOverdueCount(): number {
    return this.fsrsSummaries.reduce((sum, s) => sum + s.overdueCount + s.dueTodayCount, 0);
  }

  async startCrossSetReview(): Promise<void> {
    await this.router.navigate(["/review"]);
  }

  async ngOnInit(): Promise<void> {
    const user = await this.usersService.myUser();
    if (user) {
      this.user = user;

      this.user.sets.forEach((s) => {
        s.updatedAt = new Date(s.updatedAt);
      });
      this.user.sets = this.user.sets.sort((a, b) => {
        return new Date(b.updatedAt).valueOf() - new Date(a.updatedAt).valueOf();
      });

      this.user.folders = this.user.folders
          .sort((a, b) => {
            return new Date(b.updatedAt).valueOf() - new Date(a.updatedAt).valueOf();
          })
          .filter((f) => !f.parentFolderId);

      const summaries = await this.fsrsService.getUserSetSummaries();
      if (summaries) this.fsrsSummaries = summaries;
    }

    this.spinner.nativeElement.remove();
    this.container.nativeElement.removeAttribute("hidden");
  }
}
