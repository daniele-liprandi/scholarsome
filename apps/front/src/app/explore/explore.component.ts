import { Component, OnInit } from "@angular/core";
import { ExploreService, PublicSetItem } from "../shared/http/explore.service";
import { Meta, Title } from "@angular/platform-browser";

@Component({
  selector: "scholarsome-explore",
  templateUrl: "./explore.component.html",
  styleUrls: ["./explore.component.scss"]
})
export class ExploreComponent implements OnInit {
  constructor(
    private readonly exploreService: ExploreService,
    private readonly titleService: Title,
    private readonly metaService: Meta
  ) {}

  sets: PublicSetItem[] = [];
  total = 0;
  page = 1;
  readonly limit = 20;
  loading = true;

  search = "";
  sort: "newest" | "oldest" | "most_cards" = "newest";

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  async ngOnInit(): Promise<void> {
    this.titleService.setTitle("Explore — Scholarsome");
    this.metaService.addTag({ name: "description", content: "Browse public study sets shared by other users on Scholarsome." });
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    const result = await this.exploreService.publicSets({
      search: this.search || undefined,
      sort: this.sort,
      page: this.page,
      limit: this.limit
    });
    this.loading = false;
    if (!result) return;
    this.sets = result.sets;
    this.total = result.total;
  }

  onSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(async () => {
      this.page = 1;
      await this.load();
    }, 300);
  }

  async onSortChange(): Promise<void> {
    this.page = 1;
    await this.load();
  }

  async prevPage(): Promise<void> {
    if (this.page > 1) {
      this.page--;
      await this.load();
    }
  }

  async nextPage(): Promise<void> {
    if (this.page < this.totalPages) {
      this.page++;
      await this.load();
    }
  }

  formatRelativeTime(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "1d ago";
    if (diffDays < 30) return `${diffDays}d ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths}mo ago`;
    return `${Math.floor(diffMonths / 12)}y ago`;
  }
}
