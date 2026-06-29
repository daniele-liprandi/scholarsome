import { RouterModule, Routes } from "@angular/router";
import { NgModule } from "@angular/core";
import { ExploreComponent } from "./explore.component";
import { AuthGuardService } from "../auth/auth-guard.service";

const routes: Routes = [
  { path: "", component: ExploreComponent, canActivate: [AuthGuardService] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ExploreRoutingModule {}
