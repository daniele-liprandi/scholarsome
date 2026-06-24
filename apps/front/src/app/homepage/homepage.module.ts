import { NgModule } from "@angular/core";
import { HomepageComponent } from "./homepage.component";
import { FontAwesomeModule } from "@fortawesome/angular-fontawesome";
import { HomepageRoutingModule } from "./homepage-routing.module";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";

@NgModule({
  imports: [
    CommonModule,
    HomepageRoutingModule,
    FontAwesomeModule,
    RouterModule
  ],
  declarations: [HomepageComponent]
})
export class HomepageModule {}
