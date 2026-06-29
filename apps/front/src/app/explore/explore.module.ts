import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { ExploreComponent } from "./explore.component";
import { ExploreRoutingModule } from "./explore-routing.module";

@NgModule({
  imports: [CommonModule, FormsModule, RouterModule, ExploreRoutingModule],
  declarations: [ExploreComponent]
})
export class ExploreModule {}
