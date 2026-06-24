import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { ReviewRoutingModule } from "./review-routing.module";
import { ReviewComponent } from "./review.component";

@NgModule({
  imports: [
    CommonModule,
    ReviewRoutingModule,
    RouterModule
  ],
  declarations: [ReviewComponent]
})
export class ReviewModule {}
